fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "shell_command",
            "site_preferences",
            "site_state",
            "site_preview",
            "site_notice",
            "site_quit",
            "audio_choose",
            "picker_command",
            "audio_start",
            "audio_stop",
            "audio_ack",
            "capture_choose",
            "capture_picker_command",
            "video_start",
            "video_stop",
            "video_ack",
        ]),
    ))
    .expect("Tauri build metadata failed");
}
