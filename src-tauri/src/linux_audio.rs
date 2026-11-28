//! Capture only a selected playback stream through PulseAudio / pipewire-pulse.
//! Never fall back to the default recording source (which may be a microphone).
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeSet, HashMap},
    io::Read,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle, Manager,
};
#[derive(Clone, Serialize)]
pub struct Source {
    pub id: String,
    pub name: String,
    pub executable: String,
    #[serde(skip)]
    pub pid: u32,
    #[serde(skip)]
    sink: u32,
}
pub fn sources() -> Vec<Source> {
    let Ok(output) = Command::new("pactl")
        .args(["--format=json", "list", "sink-inputs"])
        .output()
    else {
        return vec![];
    };
    if !output.status.success() {
        return vec![];
    }
    parse_sources(&output.stdout)
}
fn parse_sources(bytes: &[u8]) -> Vec<Source> {
    let values: Vec<Value> = serde_json::from_slice(bytes).unwrap_or_default();
    values
        .iter()
        .filter_map(|v| {
            let index = v["index"].as_u64()?;
            let sink = v["sink"].as_u64()?;
            let props = &v["properties"];
            let pid = props["application.process.id"]
                .as_str()?
                .parse::<u32>()
                .ok()?;
            if pid == std::process::id() {
                return None;
            }
            let executable = props["application.process.binary"]
                .as_str()
                .unwrap_or("")
                .to_string();
            if executable.to_ascii_lowercase().contains("simpleshare")
                || executable == "WebKitWebProcess"
            {
                return None;
            }
            let name = props["application.name"].as_str().unwrap_or("Application");
            let media = props["media.name"].as_str().unwrap_or("Playback");
            Some(Source {
                id: index.to_string(),
                name: format!("{name} · {media}"),
                executable,
                pid,
                sink: sink as u32,
            })
        })
        .collect()
}
pub fn valid(source: &Source) -> bool {
    sources().iter().any(|v| {
        v.id == source.id
            && v.pid == source.pid
            && v.executable == source.executable
            && v.sink == source.sink
    })
}
struct Job {
    child: Arc<Mutex<Child>>,
    pending: Arc<Mutex<BTreeSet<u32>>>,
}
#[derive(Clone, Default)]
pub struct Audio {
    jobs: Arc<Mutex<HashMap<String, Job>>>,
    gate: Arc<Mutex<()>>,
}
impl Audio {
    pub fn start(
        &self,
        app: AppHandle,
        id: String,
        source: Source,
        channel: Channel<InvokeResponseBody>,
    ) -> Result<(), String> {
        let _gate = self.gate.lock().unwrap();
        if self.jobs.lock().unwrap().len() >= 3 {
            return Err("Remove an audio source before adding another".into());
        }
        if !valid(&source) {
            return Err(
                "This application's playback stream ended. Start its sound and select it again."
                    .into(),
            );
        }
        let output = Command::new("pactl")
            .args(["--format=json", "list", "sinks"])
            .output()
            .map_err(|_| "Install pulseaudio-utils to share application audio")?;
        let sinks: Vec<Value> = serde_json::from_slice(&output.stdout)
            .map_err(|_| "Could not read playback devices")?;
        let monitor = sinks
            .iter()
            .find(|v| v["index"].as_u64() == Some(source.sink as u64))
            .and_then(|v| v["monitor_source"].as_str())
            .ok_or("Playback monitor unavailable")?;
        // Both flags are mandatory: an explicit output monitor and a single sink input.
        let mut child=Command::new("parec").args(["--raw","--format=s16le","--rate=48000","--channels=2","--latency-msec=30","--client-name=SimpleShare",&format!("--device={monitor}"),&format!("--monitor-stream={}",source.id)])
            .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e|format!("Could not start application audio: {e}. Install pulseaudio-utils and enable pipewire-pulse or PulseAudio."))?;
        let mut stdout = child.stdout.take().ok_or("Audio output unavailable")?;
        let child = Arc::new(Mutex::new(child));
        let pending = Arc::new(Mutex::new(BTreeSet::new()));
        self.jobs.lock().unwrap().insert(
            id.clone(),
            Job {
                child: child.clone(),
                pending: pending.clone(),
            },
        );
        let jobs = self.jobs.clone();
        thread::spawn(move || {
            let mut sequence = 0u32;
            let mut pcm = [0u8; 3840];
            loop {
                if stdout.read_exact(&mut pcm).is_err() {
                    break;
                }
                if !jobs.lock().unwrap().contains_key(&id) {
                    return;
                }
                let mut credits = pending.lock().unwrap();
                if credits.len() >= 8 {
                    continue;
                }
                sequence = sequence.wrapping_add(1);
                credits.insert(sequence);
                drop(credits);
                let mut packet = sequence.to_le_bytes().to_vec();
                packet.extend_from_slice(&pcm);
                if channel.send(InvokeResponseBody::Raw(packet)).is_err() {
                    break;
                }
            }
            if jobs.lock().unwrap().remove(&id).is_some() {
                if let Some(view) = app.get_webview("live") {
                    let _=view.eval(format!("window.__ssAudioError?.({},'Application audio ended. Select the source again; your picture can continue.')",serde_json::to_string(&id).unwrap()));
                }
            }
            let mut process = child.lock().unwrap();
            let _ = process.kill();
            let _ = process.wait();
        });
        Ok(())
    }
    pub fn ack(&self, id: &str, sequence: u32) {
        if let Some(job) = self.jobs.lock().unwrap().get(id) {
            job.pending.lock().unwrap().remove(&sequence);
        }
    }
    pub fn stop(&self, id: &str) {
        if let Some(job) = self.jobs.lock().unwrap().remove(id) {
            let mut child = job.child.lock().unwrap();
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    pub fn stop_all(&self) {
        let ids: Vec<_> = self.jobs.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.stop(&id);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_playback_with_a_process_is_selectable() {
        let list=parse_sources(br#"[{"index":12,"sink":2,"properties":{"application.process.id":"12345","application.name":"Game","application.process.binary":"game","media.name":"Music"}},{"index":13,"sink":2,"properties":{"application.name":"Unknown"}},{"index":14,"sink":2,"properties":{"application.process.id":"12346","application.process.binary":"WebKitWebProcess"}}]"#);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "12");
        assert_eq!(list[0].sink, 2);
    }
}
