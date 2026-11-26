//! The local-only network policy of `packages/util/src/network-policy.ts`, for this client's own connections.

use url::{Host, Url};

/// Only this machine. No setting or environment variable adds a host.
pub fn allowed(url: &Url) -> bool {
    match url.host() {
        None => false,
        Some(Host::Ipv4(ip)) => ip.is_loopback(),
        Some(Host::Ipv6(ip)) => ip.is_loopback(),
        // The exact name only: a resolver may send `*.localhost` elsewhere.
        Some(Host::Domain(domain)) => domain.strip_suffix('.').unwrap_or(domain).eq_ignore_ascii_case("localhost"),
    }
}

/// What a refused connection says.
pub fn blocked(url: &Url) -> String {
    format!("Blocked by the local-only network policy: {}", url.host_str().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_this_machine() {
        let cases = [
            ("http://127.0.0.1:4096/x", true),
            ("ws://localhost:1/x", true),
            ("http://[::1]:80/x", true),
            ("http://x.localhost/x", false),
            ("https://api.github.com/x", false),
            ("https://huggingface.co/x", false),
            ("http://192.168.1.5/x", false),
            ("http://0.0.0.0/x", false),
            ("http://127.0.0.1.evil.test/x", false),
            ("http://169.254.169.254/x", false),
        ];
        for (url, expected) in cases {
            assert_eq!(allowed(&crate::js::parse_url(url).unwrap()), expected, "{url}");
        }
    }
}
