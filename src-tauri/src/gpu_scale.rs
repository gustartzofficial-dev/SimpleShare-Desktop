use windows::{
    core::{s, PCSTR},
    Win32::Graphics::{Direct3D::Fxc::D3DCompile, Direct3D11::*, Dxgi::Common::*},
};
use windows_capture::frame::Frame;

// Resize on the capture GPU before the only GPU-to-CPU readback. The bridge
// therefore transfers the chosen stream resolution, not the whole desktop.
const SHADER: &str = r#"
Texture2D<float4> source : register(t0);
RWTexture2D<float4> target : register(u0);
SamplerState linearSampler : register(s0);
[numthreads(8,8,1)] void main(uint3 pixel:SV_DispatchThreadID) {
 uint sw,sh,dw,dh; source.GetDimensions(sw,sh); target.GetDimensions(dw,dh);
 if(pixel.x>=dw||pixel.y>=dh)return;
 float scale=min(float(dw)/sw,float(dh)/sh);
 float2 size=float2(sw,sh)*scale;
 float2 uv=(float2(pixel.xy)+0.5-(float2(dw,dh)-size)*0.5)/size;
 target[pixel.xy]=(any(uv<0)||any(uv>1))?float4(0,0,0,1):float4(source.SampleLevel(linearSampler,uv,0).rgb,1);
}
"#;
pub struct Scaler {
    input: ID3D11Texture2D,
    source: ID3D11ShaderResourceView,
    output: ID3D11Texture2D,
    target: ID3D11UnorderedAccessView,
    staging: ID3D11Texture2D,
    shader: ID3D11ComputeShader,
    sampler: ID3D11SamplerState,
    pub source_size: (u32, u32),
    width: u32,
    height: u32,
}
impl Scaler {
    pub fn new(frame: &Frame, width: u32, height: u32) -> windows::core::Result<Self> {
        unsafe {
            let device = frame.device();
            let mut code = None;
            D3DCompile(
                SHADER.as_ptr().cast(),
                SHADER.len(),
                PCSTR::null(),
                None,
                None,
                s!("main"),
                s!("cs_5_0"),
                0,
                0,
                &mut code,
                None,
            )?;
            let code = code.unwrap();
            let mut shader = None;
            device.CreateComputeShader(
                std::slice::from_raw_parts(code.GetBufferPointer().cast(), code.GetBufferSize()),
                None,
                Some(&mut shader),
            )?;
            let input_desc = D3D11_TEXTURE2D_DESC {
                Width: frame.width(),
                Height: frame.height(),
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_R8G8B8A8_UNORM,
                SampleDesc: DXGI_SAMPLE_DESC {
                    Count: 1,
                    Quality: 0,
                },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
                ..Default::default()
            };
            let mut input = None;
            device.CreateTexture2D(&input_desc, None, Some(&mut input))?;
            let input = input.unwrap();
            let mut source = None;
            device.CreateShaderResourceView(&input, None, Some(&mut source))?;
            let out_desc = D3D11_TEXTURE2D_DESC {
                Width: width,
                Height: height,
                BindFlags: D3D11_BIND_UNORDERED_ACCESS.0 as u32,
                ..input_desc
            };
            let mut output = None;
            device.CreateTexture2D(&out_desc, None, Some(&mut output))?;
            let output = output.unwrap();
            let mut target = None;
            device.CreateUnorderedAccessView(&output, None, Some(&mut target))?;
            let mut staging = None;
            device.CreateTexture2D(
                &D3D11_TEXTURE2D_DESC {
                    Usage: D3D11_USAGE_STAGING,
                    BindFlags: 0,
                    CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                    ..out_desc
                },
                None,
                Some(&mut staging),
            )?;
            let mut sampler = None;
            device.CreateSamplerState(
                &D3D11_SAMPLER_DESC {
                    Filter: D3D11_FILTER_MIN_MAG_MIP_LINEAR,
                    AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
                    AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
                    AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
                    MaxLOD: f32::MAX,
                    ComparisonFunc: D3D11_COMPARISON_NEVER,
                    ..Default::default()
                },
                Some(&mut sampler),
            )?;
            Ok(Self {
                input,
                source: source.unwrap(),
                output,
                target: target.unwrap(),
                staging: staging.unwrap(),
                shader: shader.unwrap(),
                sampler: sampler.unwrap(),
                source_size: (frame.width(), frame.height()),
                width,
                height,
            })
        }
    }
    // Caller exclusively owns this slot until the JS consumer acknowledges its sequence.
    pub unsafe fn copy_to(&self, frame: &Frame, destination: usize) -> windows::core::Result<()> {
        let context = frame.device_context();
        context.CopyResource(&self.input, frame.as_raw_texture());
        context.CSSetShader(&self.shader, None);
        context.CSSetShaderResources(0, Some(&[Some(self.source.clone())]));
        context.CSSetSamplers(0, Some(&[Some(self.sampler.clone())]));
        context.CSSetUnorderedAccessViews(0, 1, Some([Some(self.target.clone())].as_ptr()), None);
        context.Dispatch(self.width.div_ceil(8), self.height.div_ceil(8), 1);
        context.CSSetShaderResources(0, Some(&[None]));
        context.CSSetUnorderedAccessViews(0, 1, Some([None].as_ptr()), None);
        context.CopyResource(&self.staging, &self.output);
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        context.Map(&self.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
        let stride = self.width as usize * 4;
        for row in 0..self.height as usize {
            std::ptr::copy_nonoverlapping(
                (mapped.pData as *const u8).add(row * mapped.RowPitch as usize),
                (destination as *mut u8).add(row * stride),
                stride,
            );
        }
        context.Unmap(&self.staging, 0);
        Ok(())
    }
}
