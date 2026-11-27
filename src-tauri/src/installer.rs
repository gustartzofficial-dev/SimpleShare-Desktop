use serde_json::{json, Value};
use tauri::{Webview, WebviewUrl};
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let mut builder = tauri::WebviewWindowBuilder::new(
        &*app,
        "installer",
        WebviewUrl::App("installer.html".into()),
    );
    if let Some(directory) =
        std::env::var_os("SIMPLESHARE_QA_PROFILE").filter(|_| std::env::args().any(|a| a == "--qa"))
    {
        builder =
            builder.data_directory(std::path::PathBuf::from(directory).join("installer-webview"));
    }
    builder
        .title("Install SimpleShare")
        .inner_size(760., 560.)
        .min_inner_size(680., 520.)
        .resizable(false)
        .on_navigation(crate::local_page)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()?;
    Ok(())
}
#[tauri::command]
pub async fn installer_command(
    app: tauri::AppHandle,
    webview: Webview,
    name: String,
) -> Result<Value, String> {
    crate::local_auth(&webview, "installer")?;
    match name.as_str() {
        "ready" => Ok(
            json!({"version":app.package_info().version.to_string(),"platform":std::env::consts::OS}),
        ),
        "close" => {
            app.exit(0);
            Ok(json!({"ok":true}))
        }
        "install" => tauri::async_runtime::spawn_blocking(install)
            .await
            .map_err(|e| e.to_string())?
            .map(|p| json!({"path":p})),
        "launch" => {
            launch()?;
            app.exit(0);
            Ok(json!({"ok":true}))
        }
        _ => Err("Unknown installer command".into()),
    }
}
#[cfg(target_os = "linux")]
fn data_home() -> Result<std::path::PathBuf, String> {
    if let Some(path) = std::env::var_os("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .filter(|p| p.is_absolute())
    {
        return Ok(path);
    }
    std::env::var_os("HOME")
        .map(|p| std::path::PathBuf::from(p).join(".local/share"))
        .ok_or("Home directory unavailable".into())
}
#[cfg(target_os = "linux")]
fn install() -> Result<String, String> {
    use std::{fs, io, os::unix::fs::PermissionsExt};
    let source=std::env::var_os("APPIMAGE").map(std::path::PathBuf::from).filter(|p|p.is_file()).ok_or("Run this installer from the SimpleShare AppImage. Debian packages are installed with your package manager.")?;
    let data = data_home()?;
    let directory = data.join("SimpleShare");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let destination = directory.join("SimpleShare.AppImage");
    if destination.is_symlink() {
        return Err(
            "The install destination is a symbolic link. Choose a regular installation location."
                .into(),
        );
    }
    if fs::canonicalize(&source).ok() != fs::canonicalize(&destination).ok() {
        let temporary = directory.join(format!(".SimpleShare-{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| -> io::Result<()> {
            let mut input = fs::File::open(&source)?;
            let mut output = fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temporary)?;
            io::copy(&mut input, &mut output)?;
            output.sync_all()?;
            fs::set_permissions(&temporary, fs::Permissions::from_mode(0o755))?;
            fs::rename(&temporary, &destination)
        })();
        if let Err(error) = result {
            let _ = fs::remove_file(&temporary);
            return Err(error.to_string());
        }
    }
    let icon = data.join("icons/hicolor/256x256/apps/dev.simpleshare.desktop.png");
    fs::create_dir_all(icon.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&icon, include_bytes!("../icons/icon.png")).map_err(|e| e.to_string())?;
    let applications = data.join("applications");
    fs::create_dir_all(&applications).map_err(|e| e.to_string())?;
    let executable = destination
        .to_str()
        .ok_or("Installation path must be valid UTF-8")?;
    if executable.contains(['\n', '\r']) {
        return Err("Invalid installation path".into());
    }
    let exec = executable
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('`', "\\`")
        .replace('$', "\\$")
        .replace('%', "%%");
    fs::write(applications.join("dev.simpleshare.desktop.desktop"),format!("[Desktop Entry]\nType=Application\nName=SimpleShare\nComment=Share a screen. Keep good company.\nExec=\"{exec}\"\nIcon=dev.simpleshare.desktop\nTerminal=false\nCategories=Network;VideoConference;\nStartupWMClass=SimpleShare\n")).map_err(|e|e.to_string())?;
    Ok(destination.display().to_string())
}
#[cfg(target_os = "linux")]
fn launch() -> Result<(), String> {
    std::process::Command::new(data_home()?.join("SimpleShare/SimpleShare.AppImage"))
        .env_remove("APPIMAGE")
        .env_remove("APPDIR")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(not(target_os = "linux"))]
fn install() -> Result<String, String> {
    Err("Use the signed SimpleShare setup.exe installer on Windows.".into())
}
#[cfg(not(target_os = "linux"))]
fn launch() -> Result<(), String> {
    Err("Use the Start menu to open SimpleShare.".into())
}
