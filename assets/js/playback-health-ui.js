(function (root, factory) {
    var api = factory()
    if (typeof module === "object" && module.exports) {
        module.exports = api
    }
    root.PlaybackHealthUI = api
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    var ERROR_PREVIEW_LIMIT = 160
    var UNHEALTHY = { degraded: true, unavailable: true }

    function text(value) {
        if (value == null) {
            return ""
        }
        return String(value)
    }

    function statusLabel(status) {
        if (status === "ok") {
            return "Healthy"
        }
        if (status === "degraded") {
            return "Degraded"
        }
        if (status === "unavailable") {
            return "Unavailable"
        }
        return text(status)
    }

    function sourceLabel(source) {
        var name = text(source).toLowerCase()
        if (!name) {
            return ""
        }
        if (name.indexOf("youtube") !== -1 || name === "ytsearch" || name === "ytmsearch") {
            return "YouTube"
        }
        if (name.indexOf("spotify") !== -1 || name === "spsearch") {
            return "Spotify"
        }
        if (name === "voice") {
            return "Discord Voice"
        }
        if (name.indexOf("node") === 0) {
            return "Lavalink"
        }
        return name.charAt(0).toUpperCase() + name.slice(1)
    }

    function describeComponent(component) {
        var id = text(component && (component.component || component.kind))
        var lower = id.toLowerCase()
        var title = "Playback"
        var identifier = id || null
        var kind = "playback"

        if (lower.indexOf("node:") === 0) {
            title = "Lavalink"
            identifier = id.slice("node:".length) || id
            kind = "lavalink"
        } else if (lower === "source:youtube" || lower === "youtube") {
            title = "YouTube"
            kind = "youtube"
        } else if (lower === "source:spotify" || lower === "spotify") {
            title = "Spotify"
            kind = "spotify"
        } else if (lower.indexOf("source:") === 0) {
            title = sourceLabel(id.slice("source:".length))
            kind = "source"
        } else if (lower === "voice") {
            title = "Discord Voice"
            identifier = null
            kind = "voice"
        } else if (lower === "node") {
            title = "Lavalink"
            identifier = null
            kind = "lavalink"
        }

        var installed = component && component.installed_version ? text(component.installed_version) : ""
        var available = component && component.available_version ? text(component.available_version) : ""
        var fields = {
            title: title,
            identifier: identifier && identifier !== title ? identifier : null,
            kind: kind,
            status: component && component.status ? component.status : "ok",
            statusLabel: statusLabel(component && component.status),
            message: component && component.message ? text(component.message) : "",
        }
        if (installed) {
            fields.installed = installed
        }
        if (available) {
            fields.available = available
        }
        return fields
    }

    function publicMessageFromComponents(components) {
        var list = Array.isArray(components) ? components : []
        for (var i = 0; i < list.length; i++) {
            var component = list[i] || {}
            if (!UNHEALTHY[component.status]) {
                continue
            }
            var described = describeComponent(component)
            if (described.kind === "youtube") {
                return "YouTube playback is currently experiencing problems."
            }
            if (described.kind === "spotify") {
                return "Spotify playback is currently experiencing problems."
            }
            if (described.kind === "source") {
                return "Playback is currently experiencing problems."
            }
            if (described.kind === "lavalink") {
                return "Playback is currently unavailable."
            }
            if (described.kind === "voice") {
                return "Voice is currently disconnected."
            }
        }
        return ""
    }

    function uniqueLines(lines) {
        var seen = {}
        var result = []
        lines.forEach(function (line) {
            var value = text(line).trim()
            if (!value || seen[value]) {
                return
            }
            seen[value] = true
            result.push(value)
        })
        return result
    }

    var BANNER_AUTO_DISMISS_MS = 5000

    function bannerSignature(banner) {
        if (!banner || !banner.visible) {
            return ""
        }
        return [banner.tone || "", (banner.lines || []).join("\n")].join("|")
    }

    function shouldShowHealthBanner(banner, dismissedSignature) {
        if (!banner || !banner.visible) {
            return false
        }
        return bannerSignature(banner) !== (dismissedSignature || "")
    }

    function compactBanner(data) {
        data = data || {}
        var isAdmin = data.admin === true
        var components = Array.isArray(data.components) ? data.components : []
        var failure = data.playbackFailure
        var hasUnavailable = components.some(function (component) {
            return component && component.status === "unavailable"
        })
        var hasDegraded = components.some(function (component) {
            return component && component.status === "degraded"
        })
        var tone = null
        if (hasUnavailable) {
            tone = "unavailable"
        } else if (hasDegraded) {
            tone = "degraded"
        } else if (failure) {
            tone = "track"
        }

        var lines = []
        if (failure) {
            if (failure.title) {
                lines.push("Couldn't play " + text(failure.title) + ".")
            } else if (failure.userMessage) {
                lines.push(text(failure.userMessage))
            } else {
                lines.push("This track could not be played.")
            }
        }

        if (data.message) {
            lines.push(text(data.message))
        } else {
            var derived = publicMessageFromComponents(components)
            if (derived) {
                lines.push(derived)
            }
        }

        lines = uniqueLines(lines)
        return {
            visible: lines.length > 0,
            lines: lines,
            showDiagnosticsLink: isAdmin && lines.length > 0,
            tone: tone,
        }
    }

    function truncateError(value, limit) {
        var full = text(value)
        var max = limit == null ? ERROR_PREVIEW_LIMIT : limit
        if (!full) {
            return { preview: "", full: "", expandable: false }
        }
        if (full.length <= max) {
            return { preview: full, full: full, expandable: false }
        }
        return {
            preview: full.slice(0, max).replace(/\s+$/, "") + "…",
            full: full,
            expandable: true,
        }
    }

    function lastUnhealthyError(components) {
        var list = Array.isArray(components) ? components : []
        for (var i = 0; i < list.length; i++) {
            var component = list[i] || {}
            if (!UNHEALTHY[component.status] || !component.last_error) {
                continue
            }
            var detail = component.last_error.detail || component.last_error.code
            if (detail) {
                return truncateError(detail)
            }
        }
        return null
    }

    function diagnosticsModel(data) {
        data = data || {}
        var isAdmin = data.admin === true
        var components = Array.isArray(data.components) ? data.components : []
        var banner = compactBanner(data)
        if (!isAdmin) {
            return {
                sidebarVisible: false,
                viewLinkVisible: false,
                components: [],
                failure: null,
                lastError: null,
                healthyMessage: null,
                banner: banner,
            }
        }

        var unhealthy = components.some(function (component) {
            return component && UNHEALTHY[component.status]
        })
        var failure = null
        if (data.playbackFailure) {
            failure = {
                title: data.playbackFailure.title ? text(data.playbackFailure.title) : "",
                source: sourceLabel(data.playbackFailure.source),
                code: data.playbackFailure.code ? text(data.playbackFailure.code) : "",
            }
            if (!failure.title && !failure.source && !failure.code) {
                failure = null
            }
        }

        return {
            sidebarVisible: true,
            viewLinkVisible: banner.showDiagnosticsLink,
            components: components.map(describeComponent),
            failure: failure,
            lastError: unhealthy ? lastUnhealthyError(components) : null,
            healthyMessage: unhealthy || failure ? null : "All playback services are operating normally.",
            banner: banner,
        }
    }

    return {
        ERROR_PREVIEW_LIMIT: ERROR_PREVIEW_LIMIT,
        BANNER_AUTO_DISMISS_MS: BANNER_AUTO_DISMISS_MS,
        compactBanner: compactBanner,
        diagnosticsModel: diagnosticsModel,
        describeComponent: describeComponent,
        statusLabel: statusLabel,
        sourceLabel: sourceLabel,
        truncateError: truncateError,
        publicMessageFromComponents: publicMessageFromComponents,
        bannerSignature: bannerSignature,
        shouldShowHealthBanner: shouldShowHealthBanner,
    }
})
