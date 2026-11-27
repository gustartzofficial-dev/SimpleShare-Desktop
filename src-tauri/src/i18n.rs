//! Native strings shown outside the web views: tray menu, dialogs, window titles and notices.
//! The language follows the website preference ("simpleshare-lang") and otherwise the Windows
//! display language, matching the automatic choice made by the live website.

pub const LANGUAGES: [&str; 3] = ["en", "pt-BR", "es"];

pub fn resolve(preference: Option<&str>) -> &'static str {
    match preference {
        Some("en") => "en",
        Some("pt-BR") => "pt-BR",
        Some("es") => "es",
        _ => system(),
    }
}

#[cfg(windows)]
fn system() -> &'static str {
    // The primary language id is the low 10 bits of the LANGID.
    let id = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() } & 0x3ff;
    match id {
        0x16 => "pt-BR",
        0x0a => "es",
        _ => "en",
    }
}
#[cfg(not(windows))]
fn system() -> &'static str {
    let locale = ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .find_map(|key| std::env::var(key).ok().filter(|v| !v.is_empty()))
        .unwrap_or_default()
        .to_lowercase();
    if locale.starts_with("pt") {
        "pt-BR"
    } else if locale.starts_with("es") {
        "es"
    } else {
        "en"
    }
}

pub fn tr(lang: &str, key: &str) -> &'static str {
    let pt = lang == "pt-BR";
    let es = lang == "es";
    let pick = |en: &'static str, pt_text: &'static str, es_text: &'static str| {
        if pt {
            pt_text
        } else if es {
            es_text
        } else {
            en
        }
    };
    match key {
        "tray.show" => pick(
            "Open SimpleShare",
            "Abrir o SimpleShare",
            "Abrir SimpleShare",
        ),
        "tray.compact" => pick(
            "Toggle compact mode",
            "Alternar modo compacto",
            "Alternar modo compacto",
        ),
        "tray.stop" => pick(
            "Stop sharing",
            "Parar de compartilhar",
            "Dejar de compartir",
        ),
        "tray.quit" => pick("Quit", "Sair", "Salir"),
        "quit.title" => pick(
            "Quit SimpleShare?",
            "Sair do SimpleShare?",
            "¿Salir de SimpleShare?",
        ),
        "quit.message" => pick(
            "You are sharing or watching a stream. Leave the room and quit?",
            "Você está compartilhando ou assistindo uma transmissão. Sair da sala e fechar o app?",
            "Estás compartiendo o mirando una transmisión. ¿Salir de la sala y cerrar la app?",
        ),
        "quit.yes" => pick("Quit", "Sair", "Salir"),
        "quit.no" => pick("Stay", "Ficar", "Quedarme"),
        "load.failed" => pick(
            "The live website did not finish loading. Check your connection and try again.",
            "O site não terminou de carregar. Verifique sua conexão e tente de novo.",
            "El sitio no terminó de cargar. Revisa tu conexión e inténtalo de nuevo.",
        ),
        "navigate.sharing" => pick(
            "Stop your current share before opening another room",
            "Pare o compartilhamento atual antes de abrir outra sala",
            "Detén lo que compartes antes de abrir otra sala",
        ),
        "favorite.none" => pick(
            "Open a room first",
            "Abra uma sala primeiro",
            "Abre una sala primero",
        ),
        "audio.title" => pick(
            "Choose application sound",
            "Escolha o som do aplicativo",
            "Elige el sonido de la aplicación",
        ),
        "capture.title" => pick(
            "Share a window or display",
            "Compartilhar uma janela ou tela",
            "Compartir una ventana o pantalla",
        ),
        "update.idle" => pick(
            "Updates are checked automatically while idle",
            "As atualizações são verificadas automaticamente quando o app está ocioso",
            "Las actualizaciones se buscan automáticamente cuando la app está inactiva",
        ),
        "update.checking" => pick(
            "Checking GitHub for signed updates…",
            "Procurando atualizações assinadas no GitHub…",
            "Buscando actualizaciones firmadas en GitHub…",
        ),
        "update.latest" => pick(
            "You have the latest release",
            "Você já tem a versão mais recente",
            "Ya tienes la versión más reciente",
        ),
        "update.available" => pick(
            "Update {version} is available",
            "A atualização {version} está disponível",
            "La actualización {version} está disponible",
        ),
        "update.unavailable" => pick(
            "Update check unavailable: {error}",
            "Não foi possível verificar atualizações: {error}",
            "No se pudo buscar actualizaciones: {error}",
        ),
        "update.downloading" => pick(
            "Downloading and verifying the signed installer…",
            "Baixando e verificando o instalador assinado…",
            "Descargando y verificando el instalador firmado…",
        ),
        "update.waitRoom" => pick(
            "The update waits until you finish sharing or watching",
            "A atualização espera você terminar de compartilhar ou assistir",
            "La actualización espera a que termines de compartir o mirar",
        ),
        "update.leaveRoom" => pick(
            "Leave the room before installing the update",
            "Saia da sala antes de instalar a atualização",
            "Sal de la sala antes de instalar la actualización",
        ),
        "update.checkFirst" => pick(
            "Check for updates first",
            "Procure atualizações primeiro",
            "Busca actualizaciones primero",
        ),
        "room.default" => pick("Room", "Sala", "Sala"),
        "room.saved" => pick("Saved room", "Sala salva", "Sala guardada"),
        _ => "",
    }
}

pub fn tr_with(lang: &str, key: &str, name: &str, value: &str) -> String {
    tr(lang, key).replace(&format!("{{{name}}}"), value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_preferences_win_and_every_key_is_translated() {
        assert_eq!(resolve(Some("pt-BR")), "pt-BR");
        assert_eq!(resolve(Some("es")), "es");
        assert_eq!(resolve(Some("en")), "en");
        for key in [
            "tray.show",
            "quit.message",
            "load.failed",
            "update.available",
            "capture.title",
        ] {
            for lang in LANGUAGES {
                assert!(!tr(lang, key).is_empty(), "{lang} {key}");
            }
        }
        assert_eq!(
            tr_with("pt-BR", "update.available", "version", "0.3.0"),
            "A atualização 0.3.0 está disponível"
        );
    }
}
