const assert = require("assert")
const path = require("path")
const ui = require(path.join(__dirname, "..", "assets", "js", "playback-health-ui.js"))

const ADMIN_HEALTH = {
    admin: true,
    components: [
        {
            component: "node:DEFAULT",
            status: "ok",
            installed_version: "4.2.2",
            available_version: null,
            message: null,
            last_error: null,
        },
        {
            component: "source:youtube",
            status: "degraded",
            installed_version: "1.18.0",
            available_version: null,
            message: "YouTube source is reporting repeated failures. Installed plugin: youtube-plugin 1.18.0. Check/update the Lavalink YouTube plugin.",
            last_error: {
                code: "SOURCE_AUTH_REQUIRED",
                detail: '<img src=x onerror=alert(1)> All clients failed to load the item because the extractor crashed repeatedly. ' + "x".repeat(80),
            },
        },
        {
            component: "voice",
            status: "ok",
        },
    ],
    playbackFailure: {
        code: "SOURCE_AUTH_REQUIRED",
        title: "PinkPantheress - Stateside + Zara Larsson",
        source: "youtube",
    },
}

const PUBLIC_HEALTH = {
    admin: false,
    components: [{ kind: "youtube", status: "degraded" }],
    message: "YouTube playback is currently experiencing problems.",
    playbackFailure: {
        title: "PinkPantheress - Stateside + Zara Larsson",
        userMessage: "This track could not be played.",
    },
}

const HEALTHY_ADMIN = {
    admin: true,
    components: [
        { component: "source:youtube", status: "ok", installed_version: "1.18.0", available_version: null },
        { component: "node:DEFAULT", status: "ok", installed_version: "4.2.2", available_version: null },
        { component: "voice", status: "ok" },
    ],
    playbackFailure: null,
}

function bannerText(data) {
    return ui.compactBanner(data).lines.join("\n")
}

const adminBanner = ui.compactBanner(ADMIN_HEALTH)
assert.strictEqual(adminBanner.tone, "degraded")
assert.strictEqual(adminBanner.showDiagnosticsLink, true, "admin warning has View diagnostics")
assert.ok(adminBanner.lines.some((line) => line.indexOf("PinkPantheress") !== -1))
assert.ok(adminBanner.lines.some((line) => line.indexOf("YouTube playback is currently experiencing problems.") !== -1))
assert.ok(!bannerText(ADMIN_HEALTH).includes("1.18.0"))
assert.ok(!bannerText(ADMIN_HEALTH).includes("4.2.2"))
assert.ok(!bannerText(ADMIN_HEALTH).includes("SOURCE_AUTH_REQUIRED"))
assert.ok(!bannerText(ADMIN_HEALTH).includes("youtube-plugin"))
assert.ok(!bannerText(ADMIN_HEALTH).includes("node:DEFAULT"))
assert.ok(!bannerText(ADMIN_HEALTH).includes("last_error"))

const adminModel = ui.diagnosticsModel(ADMIN_HEALTH)
assert.strictEqual(adminModel.sidebarVisible, true)
assert.strictEqual(adminModel.viewLinkVisible, true)
assert.strictEqual(adminModel.components[0].title, "Lavalink")
assert.strictEqual(adminModel.components[0].identifier, "DEFAULT")
assert.strictEqual(adminModel.components[0].statusLabel, "Healthy")
assert.strictEqual(adminModel.components[0].installed, "4.2.2")
assert.ok(!Object.prototype.hasOwnProperty.call(adminModel.components[0], "available"))
assert.strictEqual(adminModel.components[1].title, "YouTube")
assert.strictEqual(adminModel.components[1].statusLabel, "Degraded")
assert.strictEqual(adminModel.components[1].installed, "1.18.0")
assert.ok(!Object.prototype.hasOwnProperty.call(adminModel.components[1], "available"))
assert.strictEqual(adminModel.failure.code, "SOURCE_AUTH_REQUIRED")
assert.strictEqual(adminModel.failure.source, "YouTube")
assert.ok(adminModel.lastError.expandable)
assert.strictEqual(typeof adminModel.lastError.full, "string")
assert.ok(adminModel.lastError.full.indexOf("<img src=x onerror=alert(1)>") !== -1)
assert.ok(adminModel.lastError.preview.indexOf("<img") !== -1)

const publicBanner = ui.compactBanner(PUBLIC_HEALTH)
assert.strictEqual(publicBanner.tone, "degraded")
assert.strictEqual(publicBanner.showDiagnosticsLink, false)
assert.ok(publicBanner.visible)
assert.ok(bannerText(PUBLIC_HEALTH).indexOf("YouTube playback is currently experiencing problems.") !== -1)
assert.ok(!bannerText(PUBLIC_HEALTH).includes("SOURCE_AUTH_REQUIRED"))

const publicModel = ui.diagnosticsModel(PUBLIC_HEALTH)
assert.strictEqual(publicModel.sidebarVisible, false)
assert.strictEqual(publicModel.viewLinkVisible, false)
assert.deepStrictEqual(publicModel.components, [])
assert.strictEqual(publicModel.failure, null)
assert.strictEqual(publicModel.lastError, null)

const recovered = ui.diagnosticsModel(HEALTHY_ADMIN)
assert.strictEqual(recovered.banner.visible, false)
assert.strictEqual(recovered.sidebarVisible, true)
assert.strictEqual(recovered.viewLinkVisible, false)
assert.strictEqual(recovered.failure, null)
assert.strictEqual(recovered.lastError, null)
assert.strictEqual(recovered.healthyMessage, "All playback services are operating normally.")
assert.ok(recovered.components.every((component) => component.statusLabel === "Healthy"))

const missing = ui.diagnosticsModel({})
assert.strictEqual(missing.sidebarVisible, false)
assert.strictEqual(missing.banner.visible, false)
assert.deepStrictEqual(missing.components, [])

assert.strictEqual(
    ui.compactBanner({
        components: [{ component: "source:youtube", status: "ok" }],
        playbackFailure: { title: "Private video" },
    }).tone,
    "track"
)
assert.strictEqual(
    ui.compactBanner({
        components: [{ component: "node:DEFAULT", status: "unavailable" }],
        message: "Playback is currently unavailable.",
    }).tone,
    "unavailable"
)
assert.strictEqual(
    ui.compactBanner({
        components: [
            { component: "node:DEFAULT", status: "unavailable" },
            { component: "source:youtube", status: "degraded" },
        ],
        message: "Playback is currently unavailable.",
    }).tone,
    "unavailable"
)

assert.strictEqual(ui.BANNER_AUTO_DISMISS_MS, 5000)
const dismissedBanner = ui.compactBanner(PUBLIC_HEALTH)
const dismissedSig = ui.bannerSignature(dismissedBanner)
assert.ok(ui.shouldShowHealthBanner(dismissedBanner, ""))
assert.ok(!ui.shouldShowHealthBanner(dismissedBanner, dismissedSig))
assert.ok(!ui.shouldShowHealthBanner({ visible: false, lines: [] }, ""))
const otherBanner = ui.compactBanner({
    components: [{ component: "node:DEFAULT", status: "unavailable" }],
    message: "Playback is currently unavailable.",
})
assert.ok(ui.shouldShowHealthBanner(otherBanner, dismissedSig))

const htmlError = ui.truncateError("<b>AllClientsFailedException</b> " + "x".repeat(200), 40)
assert.strictEqual(htmlError.expandable, true)
assert.ok(htmlError.preview.startsWith("<b>AllClientsFailedException</b>"))
assert.ok(!htmlError.preview.includes("<script"))

console.log("ok")
