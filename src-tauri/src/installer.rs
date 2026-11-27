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
    let source=std::env::var_os("APPIMAGE").map(std::path::PathBuf::from).filter(|p|p.is_file()).ok_or("Run this installer from the SimpleShare AppImage. Debian packages are installed with your package manager.")?;
    let data = data_home()?;
    install_appimage(&source, &data)
}
#[cfg(target_os = "linux")]
fn install_appimage(source: &std::path::Path, data: &std::path::Path) -> Result<String, String> {
    use std::{fs, io, os::unix::fs::PermissionsExt};
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
    if icon.is_symlink() {
        return Err("The application icon is a symbolic link".into());
    }
    fs::create_dir_all(icon.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(&icon, include_bytes!("../icons/icon.png")).map_err(|e| e.to_string())?;
    let applications = data.join("applications");
    fs::create_dir_all(&applications).map_err(|e| e.to_string())?;
    if applications
        .join("dev.simpleshare.desktop.desktop")
        .is_symlink()
    {
        return Err("The application launcher is a symbolic link".into());
    }
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
#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::{
        fs,
        os::unix::fs::{symlink, PermissionsExt},
    };
    #[test]
    fn appimage_install_replaces_binary_and_keeps_existing_user_data() {
        let root = std::env::temp_dir().join(format!("ss-install-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let (source, data, profile) = (
            root.join("download.AppImage"),
            root.join("data"),
            root.join("profile.json"),
        );
        fs::write(&source, b"first image").unwrap();
        fs::write(&profile, b"keep my rooms").unwrap();
        let installed = std::path::PathBuf::from(install_appimage(&source, &data).unwrap());
        assert_eq!(fs::read(&installed).unwrap(), b"first image");
        assert_ne!(
            fs::metadata(&installed).unwrap().permissions().mode() & 0o111,
            0
        );
        fs::write(&source, b"new image").unwrap();
        install_appimage(&source, &data).unwrap();
        assert_eq!(fs::read(&installed).unwrap(), b"new image");
        assert_eq!(fs::read(&profile).unwrap(), b"keep my rooms");
        assert!(
            fs::read_to_string(data.join("applications/dev.simpleshare.desktop.desktop"))
                .unwrap()
                .contains("Exec=\"")
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn installer_does_not_follow_a_destination_symlink() {
        let root = std::env::temp_dir().join(format!("ss-install-{}", uuid::Uuid::new_v4()));
        let data = root.join("data");
        fs::create_dir_all(data.join("SimpleShare")).unwrap();
        let (source, other) = (root.join("download.AppImage"), root.join("other"));
        fs::write(&source, b"image").unwrap();
        fs::write(&other, b"untouched").unwrap();
        symlink(&other, data.join("SimpleShare/SimpleShare.AppImage")).unwrap();
        assert!(install_appimage(&source, &data).is_err());
        assert_eq!(fs::read(&other).unwrap(), b"untouched");
        fs::remove_dir_all(root).unwrap();
    }
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
