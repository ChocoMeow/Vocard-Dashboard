const doneTypingInterval = 2000
const maxRecommendationTracks = 150

var typingTimer
var lastQueueScrollTop = 0
var debounceTimer

var selectedPlaylistPayload = {}
var pageStack = []

function getFooterHtml() {
    var footerHtml = $(".section.footer").html()
    return `<div class="section footer">${footerHtml}</div>`
}

function removeContextMenu() {
    $(".context-menu").remove()
    $("*").off("scroll.contextMenu")
}

function backToLastPage() {
    let lastPage = pageStack.pop()
    let prePage = pageStack[pageStack.length - 1]

    if (prePage != undefined) {
        changePage(prePage.pageId)
    } else {
        changePage("main-page")
    }

    if (lastPage && lastPage.removeAfterPop) {
        $(`#${lastPage.pageId}`).remove()
    }
}

function closeAllModals() {
    const $modals = $(document).find(".modal-background")

    $modals.each(function () {
        const $modal = $(this)
        $modal.addClass("inactive")
        setTimeout(() => {
            $modal.remove()
        }, 500)
    })
}

function updateWarningBar(status) {
    var warningBar = $(".warning-bar")
    status ? warningBar.fadeIn() : warningBar.fadeOut()
}

function updatePrimaryColor(color) {
    const $colorSelectContainer = $("#user-settings-page .color-select-container")

    const $colorOption = $colorSelectContainer.find(`.color[data-id="${color}"]`)

    if ($colorOption.length) {
        $colorSelectContainer.find(".color").removeClass("selected")
        $colorOption.addClass("selected")
    }

    const htmlElement = $("html")
    const hasLightTheme = htmlElement.hasClass("light-theme")

    // Update the HTML element's class list
    htmlElement.attr("class", function (i, c) {
        const currentClasses = (c || "").split(/\s+/)

        // Remove all classes that start with "color-"
        const remainingClasses = currentClasses.filter((cls) => !cls.startsWith("primary-") && cls !== "light-theme")

        return (hasLightTheme ? "light-theme " : "") + remainingClasses.join(" ") + (remainingClasses.length ? " " : "") + `primary-${color}`
    })
}

function toggleQueueView(init = false) {
    const container = $(".queue-container")
    if (window.matchMedia("(max-width: 768px)").matches) {
        container.toggleClass("active")
        if (container.hasClass("active")) {
            $("#queue-overlay").show()
        } else {
            $("#queue-overlay").hide()
        }
        return
    }
    // On desktop, use .close
    const isClose = container.hasClass("close")
    $("#toggle-queue-view").toggleClass("active", isClose)
    container.toggleClass("close")
    if (!init) {
        localStorage.setItem("queueView", isClose)
    }
}

function changePage(page, stack = false, removeAfterPop = true) {
    const $backMainBtn = $(".back-page-btn")
    const $headerBtn = $(".header-btn")
    const $visibleSection = $(".main-container").find(".sections:visible")

    let $activeMenuBtn = $(`#menu-${page}`)
    if ($activeMenuBtn.length > 0) {
        $(".menu-container .menu-btn").removeClass("active")
        $activeMenuBtn.addClass("active")
    }

    if (["main-page", "no-history-found"].includes(page)) {
        $backMainBtn.fadeOut(350, () => {
            $headerBtn.fadeIn(400)
        })
    } else if (["bot-not-found", "rate-limited"].includes(page)) {
        $backMainBtn.fadeOut(300)
        $headerBtn.fadeOut(350)
    } else {
        if ($backMainBtn.css("display") === "none") {
            $backMainBtn.fadeIn(300, function () {
                $backMainBtn.css("display", "flex")
            })
            $headerBtn.fadeIn(400)
        }
    }

    if (stack && pageStack[pageStack.length - 1]?.pageId != page) {
        pageStack.push({ pageId: page, removeAfterPop })
    }

    if (page == "main-page") {
        while (pageStack.length > 0) {
            const lastPage = pageStack.pop()
            if (lastPage.removeAfterPop) {
                $(`#${lastPage.pageId}`).remove()
            }
        }
    }

    if ($visibleSection.length > 0) {
        $visibleSection.fadeOut(0, () => {
            $(`#${page}`).fadeIn(350)
        })
    } else {
        $(`#${page}`).fadeIn(350)
    }
}

function buildPlaylistHtml(dataId, playlist, type) {
    let totalTime = 0
    let decodedTracks = [] // Store the decoded tracks

    // Decode all tracks once and calculate totalTime
    if (playlist?.tracks) {
        decodedTracks = playlist.tracks.map((trackId) => {
            const track = decode(trackId) // Decode the track once
            totalTime += track.length // Add to totalTime
            return track // Store the decoded track
        })
    }

    // Helper: Generate playlist image HTML
    const buildPlaylistImage = () => {
        if (playlist?.thumbnail) {
            return `<img src="${playlist.thumbnail}" onerror="this.src='/static/img/notFound.png'" alt="">`
        }

        if (decodedTracks.length > 0) {
            let trackImagesHtml = `<div class="image">`
            decodedTracks.slice(0, 4).forEach((track) => {
                trackImagesHtml += `<img src="${track.artworkUrl}" alt="">`
            })
            trackImagesHtml += `</div>`
            return trackImagesHtml
        }

        // Default skeleton loader if no thumbnail or tracks
        return `<div class="image skeleton"></div>`
    }

    // Helper: Generate track rows HTML
    const buildTrackRows = () => {
        if (!playlist?.tracks) {
            return `<div class="center"><div class="loader"></div></div>`
        }

        return decodedTracks
            .map((track, i) => {
                return buildTrackRowHtml(i + 1, track)
            })
            .join("")
    }

    // Main playlist page HTML
    return (playlistPageHtml = `
        <div class="sections" id="playlist-page-${dataId}" data-id="${dataId}" data-type="${type}" data-href="${playlist.href}">
            <div class="section">
                <div class="track-header">
                    <div class="left">
                        ${buildPlaylistImage()}
                        <div class="track-info">
                            <p class="small ${playlist?.type ? "" : "skeleton"}">${playlist?.type ? capitalize(localeTexts.playlist.type[playlist.type]) : ""}</p>
                            <h1 class="large ${playlist?.name ? "" : "skeleton"}">${playlist?.name || ""}</h1>
                            <p class="middle ${playlist?.tracks ? "" : "skeleton"}">
                                ${playlist?.tracks ? `${playlist.tracks.length}&nbsp;Songs • ${msToReadableTime(totalTime)}` : ""}
                            </p>
                        </div>
                    </div>
                    ${
                        playlist?.tracks
                            ? `<div class="actions">
                                <span class="material-symbols-outlined filled clickable large playlist-play">play_circle</span>
                                <span class="material-symbols-outlined clickable middle playlist-more">more_horiz</span>
                            </div>`
                            : ""
                    }
                </div>
            </div>

            <div class="section">
                <div class="track-rows">${buildTrackRows()}</div>
            </div>
            ${getFooterHtml()}
        </div>
    `)
}

function buildTrackRowHtml(index, track) {
    return `<div class="track-row" data-id="${track.trackId}">
        <div class="left">
            <span>${index}</span>
            <img src="${track.artworkUrl}" onerror="this.src='/static/img/notFound.png'" alt="">
            <div class="track-info">
                <p class="title">${track.title}</p>
                <p class="description">${track.author}</p>
            </div>
        </div>
        <div class="right">
            <p>${msToReadableTime(track.length)}</p>
            <span class="material-symbols-outlined clickable">more_horiz</span>
        </div>
    </div>`
}

function buildTrackCardHtml(track) {
    return `<div class="card" data-id="${track.trackId}" data-type="track">
        <div class="thumbnail">
            <img src="${track.artworkUrl}" onerror="this.src='/static/img/notFound.png'" alt="">
            <span class="material-symbols-outlined filled">play_circle</span>
        </div>
        <div class="track-info">
            <p class="title">${track.title}</p>
            <p class="description">${track.author}</p>
        </div>
    </div>`
}

function buildPlaylistCardHtml(playlist) {
    return `<div class="card" data-id="${playlist.id}" data-type="playlist" data-href="${playlist.href}">
        <div class="thumbnail">
            <img src="${playlist.imageUrl}" onerror="this.src='/static/img/notFound.png'" alt="">
            <span class="material-symbols-outlined filled">play_circle</span>
        </div>
        <div class="track-info">
            <p class="title">${playlist.title}</p>
            <p class="description">${playlist.description}</p>
        </div>
    </div>`
}

function buildQueueTrackHtml(track) {
    return `<div class="track" data-id="${track.trackId}">
        <div class="left">
            <div class="thumbnail">
                <img class="track-img" src="${track.artworkUrl}" onerror="this.src='/static/img/notFound.png'" alt="">
                <img class="requester-img" src="${track?.requester?.avatarUrl}" onerror="this.src='/static/img/notFound.png'" alt="">
            </div>
            <div class="track-info">
                <p class="title">${track.title}</a>
                <p class="description">${track.author}</a>
            </div>
        </div>
        <span class="material-symbols-outlined clickable">more_horiz</span>
    </div>`
}

function buildLyricHtml(pageId, data) {
    // Constants for fallback values
    const DEFAULT_OPTION_COUNT = 4
    const DEFAULT_LYRIC_LINES = 12

    // Destructure data with fallback defaults
    const { title = "Untitled", lyrics = null } = data || {}

    // Helper function to generate lyrics options
    const generateOptions = () => {
        if (lyrics) {
            return Object.entries(lyrics)
                .map(([key], index) => `<div class="option ${index === 0 ? "active" : ""}">${key}</div>`)
                .join("")
        }
        return Array.from({ length: DEFAULT_OPTION_COUNT }, () => `<div class="option"></div>`).join("")
    }

    // Helper function to generate lyrics
    const generateLyrics = () => {
        if (lyrics) {
            return (lyrics.default || []).map((line) => `<p class="line">${line.replace(/\n/g, "<br>")}</p>`).join("")
        }
        return Array.from({ length: DEFAULT_LYRIC_LINES }, () => `<p class="line"></p>`).join("")
    }

    // Generate HTML structure
    return `
        <div class="sections" id="${pageId}">
            <div class="section">
                <div class="header">
                    <div class="sub-title">
                        <h2>${title}</h2>
                    </div>
                </div>
                <div class="lyrics-options ${lyrics ? "" : "skeleton"}">
                    ${generateOptions()}
                </div>
                <div class="lyrics ${lyrics ? "" : "skeleton"}">
                    ${generateLyrics()}
                </div>
            </div>
        </div>
    `
}

function buildSettingPageHtml(guildId, data) {
    const generateField = (key, fieldData) => {
        let sectionHtml = ""

        switch (fieldData.inputType) {
            case "text":
                sectionHtml = `<input data-id="${key}" class="text-input" type="text" placeholder="${fieldData?.placeholder}" value="${fieldData.default || ""}" maxlength="${
                    fieldData.maxLength
                }">`
                break

            case "dropdown":
                sectionHtml = `<div class="select-container">
                    <div class="selected-container">
                        <p data-id="${key}">${fieldData.default || ""}</p>
                        <span class="material-symbols-outlined">keyboard_arrow_up</span>
                    </div>
                    <div class="options">
                        ${fieldData.options.map((option) => `<p class="option">${option}</p>`).join("")}
                    </div>
                </div>`
                break

            case "switch":
                sectionHtml = `
                    <label class="switch">
                        <input data-id="${key}" type="checkbox" ${fieldData.default ? "checked" : ""}>
                        <span class="switch-slider"></span>
                    </label>`
                break
        }

        return `
            <div class="settings-row ${fieldData.optionClasses.join(" ")}">
                <div class="info">
                    <h3 class="title">${fieldData.title}</h3>
                    <p class="desc">${fieldData.description}</p>
                </div>
                ${sectionHtml}
            </div>`
    }

    // Generate all fields dynamically
    const fieldsHtml = Object.entries(data.fields)
        .map(([key, field]) => generateField(key, field))
        .join("")

    return `
        <div class="sections" id="server-page-${guildId}" style="position: relative;">
            <div class="section">
                <div class="header ${data?.guild ? "" : "skeleton"}">
                    <div class="header-icon">
                        <img 
                            src="${data?.guild?.avatar || ""}" 
                            alt="${data?.guild?.name ?? ""}"
                            ${data?.guild ? `onerror='this.src="/static/img/notFound.png"'` : ""}
                            
                        >
                        <div class="sub-title">
                            <h2>${data?.guild?.name ?? ""}</h2>
                            <p>${data?.guild ? localeTexts.settings.variable.headerDescription : ""}</p>
                        </div>
                    </div>
                </div>
            </div>

            ${
                fieldsHtml
                    ? `<div class="section">
                    <div class="header">
                        <h2>${localeTexts.settings.variable.general}</h2>
                    </div>
                    ${fieldsHtml}
                </div>`
                    : `<div class="center">
                        <div class="loader"></div>
                    </div>`
            }

            <div class="changes-bar">
                <div class="left">
                    <span class="material-symbols-outlined filled">error</span>
                    <p>${localeTexts.settings.variable.barTitle}</p>
                </div>
                <div class="right">
                    <p class="reset">${localeTexts.settings.variable.barAction1}</p>
                    <p class="submit">${localeTexts.settings.variable.barAction2}</p>
                </div>
            </div>
        </div>
    `
}

function buildModalHtml(data) {
    // Helper function to generate input fields
    const generateField = (key, fieldData) => {
        let sectionHtml = ""

        switch (fieldData.inputType) {
            case "text":
                sectionHtml = `
                    <p class="title">${fieldData.title}</p>
                        <input type="text" placeholder="${fieldData.placeholder}" data-id="field-${key}" maxlength="${fieldData.maxLength}">
                    <p class="error-msg"></p>
                `
                break
            case "dropdown":
                const optionsHTML = Object.entries(fieldData.options)
                    .map(
                        ([key, value]) => `
                        <p class="option" data-id="${key}" data-trigger="${value.triggerClass.join(",")}">
                            ${value.title}
                        </p>`
                    )
                    .join("")

                sectionHtml = `
                    <p class="title">${fieldData.title}</p>
                    <div class="select-container">
                        <div class="selected-container" data-id="field-${key}" data-value="${fieldData.default}">
                            <p>${fieldData.options[fieldData.default]?.title}</p>
                            <span class="material-symbols-outlined">arrow_drop_up</span>
                        </div>
                        <div class="options">${optionsHTML}</div>
                    </div>
                `
                break
        }
        return `<div class="section" data-id="${key}" ${fieldData.disable ? 'data-type="canTrigger" style="display: none;"' : ""}>
            ${sectionHtml}
        </div>`
    }

    // Generate all fields dynamically
    const fieldsHtml = Object.entries(data.fields)
        .map(([key, field]) => generateField(key, field))
        .join("")

    // Return the complete modal HTML
    const dataOptions = Object.entries(data?.dataOptions)
        .map(([key, value]) => `data-${key}="${value}"`)
        .join(" ")

    return `
        <div class="modal-background" data-id="${data.type}" ${dataOptions}>
            <div class="modal-container">
                <div class="header">
                    <div class="top">
                        <div class="icon-background ${data.color}">
                            <span class="material-symbols-outlined ${data.color} icon filled">${data.header.icon}</span>
                        </div>
                        <span class="material-symbols-outlined close clickable">close</span>
                    </div>
                    <h2 class="title">${data.header.title}</h2>
                    <p class="description">${data.header.description}</p>
                </div>

                ${fieldsHtml}

                <div class="footer">
                    <div class="btn close">${localeTexts.cancel}</div>
                    <div class="btn submit ${data.footer.submit.color}">${data.footer.submit.text}</div>
                </div>
            </div>
        </div>
    `
}

function buildShortcutsModalHtml() {
    const shortcuts = [
        {
            category: localeTexts.shortcuts.categories.navigation,
            items: [
                { key: "CMD+/ or Ctrl+/", description: localeTexts.shortcuts.items.showShortcuts },
                { key: "CMD+K or Ctrl+K", description: localeTexts.shortcuts.items.focusSearch },
            ],
        },
        {
            category: localeTexts.shortcuts.categories.playbackControls,
            items: [
                { key: "Space", description: localeTexts.shortcuts.items.playPause },
                { key: "→", description: localeTexts.shortcuts.items.forward10s },
                { key: "←", description: localeTexts.shortcuts.items.rewind10s },
                { key: "↑", description: localeTexts.shortcuts.items.previousTrack },
                { key: "↓", description: localeTexts.shortcuts.items.nextTrack },
            ],
        },
        {
            category: localeTexts.shortcuts.categories.queueManagement,
            items: [
                { key: "CMD+R or Ctrl+R", description: localeTexts.shortcuts.items.toggleRepeat },
                { key: "CMD+S or Ctrl+S", description: localeTexts.shortcuts.items.toggleShuffle },
            ],
        },
    ]

    const shortcutsHtml = shortcuts
        .map(
            (category) => `
        <div class="shortcuts-category">
            <h3 class="category-title">${category.category}</h3>
            <div class="shortcuts-list">
                ${category.items
                    .map(
                        (item) => `
                    <div class="shortcut-item">
                        <div class="shortcut-key">${item.key}</div>
                        <div class="shortcut-description">${item.description}</div>
                    </div>
                `
                    )
                    .join("")}
            </div>
        </div>
    `
        )
        .join("")

    return `
        <div class="modal-background" data-id="shortcuts">
            <div class="modal-container shortcuts-modal">
                <div class="header">
                    <div class="top">
                        <div class="icon-background">
                            <span class="material-symbols-outlined icon filled">keyboard</span>
                        </div>
                        <span class="material-symbols-outlined close clickable">close</span>
                    </div>
                    <h2 class="title">${localeTexts.shortcuts.title}</h2>
                    <p class="description">${localeTexts.shortcuts.description}</p>
                </div>
                <div class="shortcuts-content">
                    ${shortcutsHtml}
                </div>
                <div class="footer">
                    <div class="btn close">${localeTexts.shortcuts.close}</div>
                </div>
            </div>
        </div>
    `
}

$(document).ready(function () {
    const player = new Player()

    $(document).keydown(function (e) {
        const $target = $(e.target)
        const isInputField = $target.is("input, textarea") || $target.prop("isContentEditable")
        if (isInputField) return

        const { key, altKey, ctrlKey, metaKey } = e

        const keyMap = {
            focusSearch: "k",
            repeat: "r",
            shuffle: "s",
            playPause: " ",
            seekForward: "ArrowRight",
            seekBackward: "ArrowLeft",
            backTo: "ArrowUp",
            skipTo: "ArrowDown",
            shortcuts: "/",
        }

        // Check for Alt/Cmd or Ctrl + Key combinations
        if (altKey || ctrlKey || metaKey) {
            switch (key) {
                case keyMap.focusSearch:
                    $("#search-query").focus()
                    break
                case keyMap.repeat:
                    if (altKey) {
                        player.repeatMode()
                    } else if (ctrlKey || metaKey) {
                        player.repeatMode()
                    }
                    break
                case keyMap.shuffle:
                    if (altKey) {
                        player.shuffle()
                    } else if (ctrlKey || metaKey) {
                        player.shuffle()
                    }
                    break
                case keyMap.shortcuts:
                    e.preventDefault()
                    closeAllModals()
                    $("html").append(buildShortcutsModalHtml())
                    break
                default:
                    break
            }
        }

        switch (key) {
            case keyMap.playPause:
                e.preventDefault()
                player.togglePause()
                break
            case keyMap.seekForward:
                player.seekTo(player.currentPosition + 10000)
                break
            case keyMap.seekBackward:
                player.seekTo(player.currentPosition - 10000)
                break
            case keyMap.backTo:
                player.backTo()
                break
            case keyMap.skipTo:
                player.skipTo()
                break
            default:
                break
        }
    })

    $(".main-container .sections").slice(1).hide()
    changePage("bot-not-found", false, false)
    if (localStorage.getItem("theme") == "light") {
        $("html").addClass("light-theme")
        $("#user-settings-page .settings-row input[data-id='toggle-dark-mode']").prop("checked", false)
    }

    // Check and set the queue view based on local storage
    $("#toggle-queue-view").addClass("active")
    if (localStorage.getItem("queueView") === "false") {
        toggleQueueView(true)
    }

    // Manage menu visibility based on local storage
    const menuView = localStorage.getItem("menuView") === "true"
    $(".menu-container").toggleClass("hide", menuView)

    updatePrimaryColor(localStorage.getItem("primaryColor") ?? "purple")

    // Fade out the screen loader when fonts is loaded
    document.fonts.ready.then(() => {
        $("#screen-loader").delay(2000).fadeOut()
    })

    $("#main-page").on("scroll", function () {
        if ($(this).scrollTop() + $(this).innerHeight() >= $(this)[0].scrollHeight * 0.85) {
            let loader = $("#recommendation-tracks-loader")

            let totalTracks = $("#history-tracks, #recommendation-tracks").find("[data-id]").length

            if (totalTracks > maxRecommendationTracks) return

            if (loader.css("display") === "none") {
                var elements = $("#history-tracks, #recommendation-tracks").find("[data-id]")
                if (elements.length > 0) {
                    loader.fadeIn(150)
                    var randomElement = elements.eq(Math.floor(Math.random() * elements.length))
                    var dataId = randomElement.data("id")
                    player.send({
                        op: "getRecommendation",
                        trackId: dataId,
                        callback: "main-page",
                    })
                }
            }
        }
    })

    $(".queue-container .scrollbar").on("scroll", function () {
        let currentScrollTop = $(this).scrollTop()
        let isScrollingUp = currentScrollTop < lastQueueScrollTop

        $("#queue-scroll-to-top").toggleClass("active", isScrollingUp && currentScrollTop > 0)

        lastQueueScrollTop = currentScrollTop
    })

    $(document).on("input", ".modal-container input", function () {
        if ($(this).val() !== "") {
            $(this).closest(".section").removeClass("error")
            $(this).closest(".section").find(".error-msg").text("")
        }
    })

    $(document).on("input propertychange change", ".settings-row [data-id]", function () {
        const dataId = $(this).attr("data-id")
        const pageContainerId = $(this).closest(".sections").attr("id")
        let value

        if ($(this).is(":checkbox")) {
            value = $(this).is(":checked")
        } else if ($(this).is("select")) {
            value = $(this).find("option:selected").val()
        } else {
            value = $(this).val() || $(this).text()
        }

        switch (true) {
            case pageContainerId.startsWith("server-page"):
                if (player.currentSettings.settings[dataId] !== value) {
                    player.modifySettings[dataId] = value

                    $(".changes-bar").addClass("show")
                }
                break
            case pageContainerId.startsWith("user-settings-page"):
                $("html").toggleClass("light-theme", !value)
                localStorage.setItem("theme", !value ? "light" : "dark")
                break
        }
    })

    $("#search-query").on("input", function () {
        clearTimeout(typingTimer)
        $("#search-loader").fadeIn(200)
        typingTimer = setTimeout(function () {
            let input = $("#search-query").val()
            if (input.replace(/\s+/g, "") != "") {
                player.send({
                    op: "getTracks",
                    query: input,
                    callback: "search-result-tracks",
                })
            } else {
                $("#search-loader").fadeOut(200)
                $(".search-result").fadeOut(200)
            }
        }, doneTypingInterval)
    })

    $("#position-bar").change(function () {
        player.seekTo(($(this).val() / 500) * player.currentTrack?.length)
    })

    $("#volume-bar").change(function () {
        player.send({ op: "updateVolume", volume: $(this).val() })
    })

    $("#position-bar").on("input", function () {
        if (player.timer.isRunning) {
            player.timer.stop()
        }
        if (player.currentTrack) {
            let progress = $(this).val() / 500
            $(this).css("background", `linear-gradient(to right, var(--primary) ${progress * 100}%, var(--text-muted) ${progress * 100}%)`)
            player.startTime.text(msToReadableTime(progress * player.currentTrack?.length))
        }
    })

    $("#volume-bar").on("input", function () {
        let progress = $(this).val()
        $(this).css("background", `linear-gradient(to right, var(--primary) ${progress}%, var(--text-muted) ${progress}%)`)
    })

    $(document).on("click", function (e) {
        const $target = $(e.target)

        if ($target.closest("#search-query").length) {
            e.stopPropagation()

            if (player.searchList.length) {
                $(".search-result").fadeIn(200)
            }
            return
        }

        $(".search-result").fadeOut()
        removeContextMenu()

        const panels = ["effect-panel", "inbox-panel", "user-menu"]
        panels.forEach((panelId) => {
            if (!$target.closest(`#${panelId}`).length && !$target.closest(`#toggle-${panelId}`).length) {
                $(`#${panelId}`).removeClass("active")
            }
        })

        if (!$target.closest(".select-container").length) {
            $(".select-container .options").hide()
            $(".select-container .material-symbols-outlined").removeClass("rotate")
        }

        const $menuContainer = $target.closest(".menu-container")
        if ($menuContainer.length) {
            if ($target.closest(".bot-selection").length) {
                const $bot = $target.closest(".option")
                if ($bot.length) {
                    player.updateSelectedBot($bot.data("id"))
                }
                return
            }

            const $btn = $target.closest(".menu-btn")
            if ($btn.length) {
                let pageName = $btn.attr("id").replace("menu-", "")
                if (pageName == "settings-page") {
                    return build_server_page()
                }

                if (pageName == "explore-page") {
                    return buildExplorePage()
                }

                if (pageName == "create-playlist") {
                    if (player.selectedBot == undefined) {
                        return player.tm.showToast("error", localeTexts.errors.noPlayerError)
                    }
                    return $("html").append(
                        buildModalHtml({
                            type: "createPlaylist",
                            color: "",
                            dataOptions: {},
                            header: {
                                icon: "queue_music",
                                title: localeTexts.playlist.create.title,
                                description: localeTexts.playlist.create.description,
                            },
                            fields: {
                                playlistName: {
                                    title: localeTexts.playlist.variable.name,
                                    placeholder: localeTexts.playlist.variable.namePlaceholder,
                                    inputType: "text",
                                    maxLength: 20,
                                    disable: false,
                                },
                                playlistType: {
                                    title: localeTexts.playlist.variable.type,
                                    default: "standard",
                                    options: {
                                        standard: {
                                            title: localeTexts.playlist.variable.standard,
                                            triggerClass: [],
                                        },
                                        online: {
                                            title: localeTexts.playlist.variable.online,
                                            triggerClass: ["playlistUrl"],
                                        },
                                    },
                                    inputType: "dropdown",
                                    disable: false,
                                },
                                playlistUrl: {
                                    title: localeTexts.playlist.variable.url,
                                    placeholder: localeTexts.playlist.variable.urlPlaceholder,
                                    inputType: "text",
                                    maxLength: 150,
                                    disable: true,
                                },
                            },
                            footer: {
                                submit: {
                                    text: localeTexts.playlist.variable.create,
                                    color: "",
                                },
                            },
                        })
                    )
                }

                if (!pageName.startsWith("playlist-page")) {
                    return changePage(pageName)
                }

                const dataId = $btn.data("id")
                const playlist = player.playlists[dataId]
                if (!playlist) return

                const pageId = `playlist-page-${dataId}`
                let playlistPage = $(document).find(`#${pageId}`)
                if (playlistPage.length > 0) {
                    $(`#${pageId}`).replaceWith(buildPlaylistHtml(dataId, playlist, "user-playlist"))
                    return changePage(pageId, true, false)
                }

                $(".main-container").append(buildPlaylistHtml(dataId, playlist, "user-playlist"))
                changePage(pageId, true, false)

                if (playlist.tracks == undefined) {
                    player.send({ op: "getPlaylist", playlistId: dataId })
                }
            }
            return
        }

        if ($target.closest("#search-result-tracks").length) {
            const $trackRow = $target.closest(".track-row")
            if ($trackRow.length) {
                const trackNumber = $trackRow.index()
                const track = player.searchList[trackNumber]
                if (track) {
                    player.send({
                        op: "addTracks",
                        tracks: [track],
                        type: "addToQueue",
                    })
                }
            }
        }

        const $card = $target.closest(".card")
        if ($card.length) {
            const cardId = $card.data("id")
            const cardType = $card.data("type")
            const clickedBtn = $target.hasClass("material-symbols-outlined")

            if (cardType == "track") {
                if (clickedBtn) {
                    player.send({
                        op: "addTracks",
                        tracks: [cardId],
                        type: "addToQueue",
                    })
                } else {
                    buildTrackPage(cardId)
                }
            } else if (cardType == "playlist") {
                const href = $card.data("href")

                if (clickedBtn) {
                    player.send({
                        op: "searchAndPlay",
                        query: href,
                        type: "addToQueue",
                    })
                } else {
                    const pageId = `playlist-page-${cardId}`
                    selectedPlaylistPayload = {
                        id: cardId,
                        href: href,
                        name: $card.find(".title").text(),
                        description: $card.find(".description").text(),
                        thumbnail: $card.find("img").attr("src"),
                        type: "playlist",
                    }
                    player.send({
                        op: "getTracks",
                        query: selectedPlaylistPayload.href,
                        callback: pageId,
                    })
                    $(".main-container").append(buildPlaylistHtml(cardId, selectedPlaylistPayload, selectedPlaylistPayload.type))
                    changePage(pageId, true)
                }
            }
            return
        }

        if ($target.closest('[id^="track-page"]').length) {
            const options = {
                selectedTrackId: $target.closest(".sections").data("id"),
            }

            if ($target.hasClass("track-more")) {
                buildContextMenu(e, ["playNow", "playNext", "AddToQueue", "getLyrics", "playlistAddTrack", "copyLink"], options)
            } else if ($target.hasClass("track-play")) {
                if (options.selectedTrackId != undefined) {
                    player.send({
                        op: "addTracks",
                        tracks: [options.selectedTrackId],
                        type: "addToQueue",
                    })
                }
            }
            return
        }

        const $playlistContainer = $target.closest('[id^="playlist-page"]')
        if ($playlistContainer.length) {
            const playlistType = $playlistContainer.data("type")
            const selectedPlaylistId = $playlistContainer.data("id")

            if ($target.hasClass("playlist-play")) {
                const tracks = $playlistContainer
                    .find(".track-row")
                    .map(function () {
                        return $(this).data("id")
                    })
                    .get()
                return player.send({
                    op: "addTracks",
                    tracks: tracks,
                    type: "addToQueue",
                })
            }

            if ($target.hasClass("playlist-more")) {
                return playlistType === "playlist"
                    ? buildContextMenu(e, ["playlistShuffle"], {
                          selectedPlaylistId,
                      })
                    : buildContextMenu(e, ["playlistShuffle", "playlistRename", "playlistRemove"], { selectedPlaylistId })
            }

            const $track = $target.closest(".track-row")
            if ($track.length) {
                const options = {
                    selectedTrackId: $track.data("id"),
                    selectedTrackIndex: $track.index(".track-rows .track-row"),
                    selectedPlaylistId,
                }

                if ($target.is("span")) {
                    if (playlistType == "playlist" || ["link", "share"].includes(player.playlists[options.selectedPlaylistId]?.type)) {
                        return buildContextMenu(e, ["playNow", "playNext", "AddToQueue", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"], options)
                    } else {
                        return buildContextMenu(
                            e,
                            ["playNow", "playNext", "AddToQueue", "playlistRemoveTrack", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"],
                            options
                        )
                    }
                } else {
                    player.send({
                        op: "addTracks",
                        tracks: [options.selectedTrackId],
                        type: "addToQueue",
                    })
                }
            }
            return
        }

        const $btn = $target.closest('[id$="-btn"]')
        if ($btn.length) {
            let btnName = $btn.attr("id").replace("-btn", "")
            let currentTrack = player.currentTrack
            switch (btnName) {
                case "menu-bar":
                    let $menuContainer = $(".menu-container")
                    $menuContainer.toggleClass("hide")
                    localStorage.setItem("menuView", $menuContainer.hasClass("hide"))
                    break

                case "back-page":
                    backToLastPage()
                    break

                case "like":
                    if (currentTrack != undefined) {
                        if ($target.hasClass("filled")) {
                            player.send({
                                op: "updatePlaylist",
                                type: "removeTrack",
                                playlistId: "200",
                                trackPosition: player.playlists["200"]?.tracks.indexOf(currentTrack.trackId),
                                trackId: currentTrack.trackId,
                            })
                        } else {
                            player.send({
                                op: "updatePlaylist",
                                type: "addTrack",
                                playlistId: "200",
                                trackId: currentTrack.trackId,
                            })
                        }
                    }
                    break

                case "play-pause":
                    player.togglePause()
                    break

                case "skip":
                    player.skipTo()
                    break

                case "back":
                    player.backTo()
                    break

                case "repeat":
                    player.repeatMode()
                    break

                case "shuffle":
                    player.shuffle()
                    break

                case "rewind":
                    player.seekTo(player.currentPosition - 10000)
                    break

                case "forward":
                    player.seekTo(player.currentPosition + 10000)
                    break

                case "clear-queue":
                    player.send({ op: "clearQueue", queueType: "queue" })
                    break

                case "clear-history-queue":
                    player.send({ op: "clearQueue", queueType: "history" })
                    break

                case "add-all-tracks":
                    player.send({
                        op: "addTracks",
                        tracks: player.searchList,
                        type: "addToQueue",
                    })
                    break

                case "reload-settings-page":
                    build_server_page()
                    break

                case "autoplay":
                    const status = !player.autoplay
                    player.send({ op: "toggleAutoplay", status })
                    break

                case "load-settings-page":
                    changePage("user-settings-page")
                    break

                default:
                    break
            }
            return
        }

        const $queueContainer = $target.closest(".queue-container")
        if ($queueContainer.length) {
            if ($target.closest("#queue-scroll-to-top").length) {
                return $queueContainer.find(".scrollbar").animate({ scrollTop: 0 }, "slow")
            } else if ($target.closest("#now-playing-section").length) {
                if ($target.closest(".track") && $target.is("span")) {
                    const options = {
                        selectedTrackId: player.currentTrack.trackId,
                    }
                    buildContextMenu(e, ["getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"], options)
                }
            } else if ($target.closest("#queue").length) {
                let $track = $target.closest(".track")
                if ($track.length) {
                    const options = {
                        selectedTrackId: $track.data("id"),
                        selectedTrackIndex: $track.index("#queue .track") + 1,
                    }
                    if ($target.is("span")) {
                        return buildContextMenu(e, ["skipTo", "moveTop", "moveEnd", "removeTrack", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"], options)
                    }
                    player.skipTo(options.selectedTrackIndex)
                }
            } else if ($target.closest("#history-queue").length) {
                let $track = $target.closest(".track")
                if ($track.length) {
                    const options = {
                        selectedTrackId: $track.data("id"),
                        selectedTrackIndex: $track.index("#history-queue .track") + 1,
                    }
                    if ($target.is("span")) {
                        return buildContextMenu(e, ["backTo", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"], options)
                    }
                    player.backTo(options.selectedTrackIndex)
                }
            }
        }

        if ($target.closest("#settings-page").length) {
            const $targetSettings = $target.closest(".server-card")
            const guildId = $targetSettings.data("id")

            if ($targetSettings.hasClass("access-server-settings")) {
                $(".main-container").append(buildSettingPageHtml(guildId, { fields: {} }))
                player.send({ op: "getSettings", guildId: guildId })
                changePage(`server-page-${guildId}`, true, false)
            }
            return
        }

        const $settingsContainer = $target.closest('[id^="server-page-"]')
        if ($settingsContainer.length) {
            let $selectContainer = $target.closest(".select-container")
            if ($selectContainer.length) {
                const $option = $target.closest(".option")
                if ($option.length) {
                    const selectedValue = $option.text()
                    const $selectedContainer = $selectContainer.find(".selected-container").find("p")

                    $selectedContainer.text(selectedValue)

                    $selectContainer.find(".options").toggle()
                    $selectContainer.find(".material-symbols-outlined").toggleClass("rotate")

                    const dataId = $selectedContainer.data("id")
                    if (player.currentSettings.settings[dataId] !== selectedValue) {
                        player.modifySettings[dataId] = selectedValue
                        $(".changes-bar").addClass("show")
                    }
                } else {
                    e.stopPropagation()
                    $selectContainer.find(".options").toggle()
                    $selectContainer.find(".material-symbols-outlined").toggleClass("rotate")
                }
            }
        }

        const $changesBar = $target.closest(".changes-bar")
        if ($changesBar.length) {
            if ($target.hasClass("reset")) {
                $changesBar.removeClass("show")
                setTimeout(function () {
                    methods.getSettings(player, player.currentSettings)
                }, 600)
            } else if ($target.hasClass("submit")) {
                $changesBar.removeClass("show")
                setTimeout(function () {
                    player.send({
                        op: "updateSettings",
                        settings: player.modifySettings,
                        guildId: player.currentSettings.guild.id,
                    })
                    player.currentSettings = {
                        ...player.currentSettings,
                        ...player.modifySettings,
                    }
                }, 600)
            }
            return
        }

        if ($target.closest('[id^="focus-"]').length) {
            let focusName = $target.attr("id").replace("focus-", "")
            $(`#${focusName}`).focus()
            return
        }

        const $togglePanel = $target.closest('[id^="toggle-"]')
        if ($togglePanel.length) {
            const targetPanelId = $togglePanel.attr("id").replace("toggle-", "")
            switch (targetPanelId) {
                case "history-list":
                    const $playNextSection = $("#play-next-section")
                    const $historySection = $("#history-section")
                    const isHistoryQueueInvisible = !$historySection.is(":visible")

                    if (isHistoryQueueInvisible && player.currentQueuePosition >= 1) {
                        $playNextSection.fadeOut(200, () => {
                            $historySection.fadeIn(200)
                        })
                    } else {
                        $historySection.fadeOut(200, () => {
                            if (player.queue.length - 1 > player.currentQueuePosition) {
                                $playNextSection.fadeIn(200)
                            }
                        })
                    }
                    break

                case "queue-view":
                case "queue-view2":
                    toggleQueueView()
                    break

                default:
                    $(`#${targetPanelId}`).toggleClass("active")
                    break
            }
            return
        }

        const $modal = $target.closest(".modal-background")
        if ($modal.length) {
            if (!$target.closest(".modal-container").length || $target.hasClass("close")) {
                return closeAllModals()
            }

            const $selectContainer = $target.closest(".select-container")
            if ($selectContainer.length) {
                const $option = $target.closest(".option")

                if ($option.length) {
                    // Handle option selection
                    const selectedId = $option.data("id")
                    const selectedValue = $option.text()
                    const selectedTriggerClass = $option.data("trigger").split(",")
                    const $selectedContainer = $selectContainer.find(".selected-container")

                    $modal.find('[data-type="canTrigger"]').hide()
                    selectedTriggerClass.forEach((id) => {
                        $modal.find(`.section[data-id="${id}"]`).show()
                    })

                    $selectedContainer.find("p").text(selectedValue)
                    $selectedContainer.attr("data-value", selectedId)

                    $selectContainer.find(".options").toggle()
                    $selectContainer.find(".material-symbols-outlined").toggleClass("rotate")
                } else {
                    // Toggle options dropdown
                    e.stopPropagation()
                    $selectContainer.find(".options").toggle()
                    $selectContainer.find(".material-symbols-outlined").toggleClass("rotate")
                }
                return
            }

            if ($target.hasClass("submit")) {
                const modalType = $modal.data("id")
                const playlistId = $modal.data("playlist-id")
                const result = $modal
                    .find('[data-id^="field-"]')
                    .map(function () {
                        const key = $(this).data("id").replace("field-", "")
                        const value = $(this).attr("data-value") ?? $(this).val()
                        return { [key]: value }
                    })
                    .get()
                    .reduce((acc, obj) => Object.assign(acc, obj), {})

                switch (modalType) {
                    case "createPlaylist":
                        return player.send({
                            op: "updatePlaylist",
                            type: "createPlaylist",
                            playlistName: result.playlistName,
                            playlistUrl: result.playlistType == "online" ? result.playlistUrl : "",
                        })

                    case "renamePlaylist":
                        return player.send(
                            (op = {
                                op: "updatePlaylist",
                                type: "renamePlaylist",
                                name: result.playlistName,
                                playlistId: playlistId,
                            })
                        )

                    case "deletePlaylist":
                        return player.send(
                            (op = {
                                op: "updatePlaylist",
                                type: "removePlaylist",
                                playlistId: playlistId,
                            })
                        )
                }
            }
            return
        }

        if ($target.closest("#inbox-panel .message .action").length) {
            const isAccept = $target.hasClass("accept")
            player.send({
                op: "updatePlaylist",
                type: "updateInbox",
                referId: $target.closest(".message").data("id"),
                accept: isAccept,
            })
            return
        }

        if ($target.closest("#effect-panel .options .option").length) {
            if (!player.availableFilters.length) return

            let effectName = $target.closest(".option").data("id")
            if (effectName === "none") {
                player.send({ op: "updateFilter", type: "reset" })
            } else {
                const $option = $target.closest(".option")
                player.send({
                    op: "updateFilter",
                    type: $option.hasClass("active") ? "remove" : "add",
                    tag: effectName,
                })
            }
        }

        const $userSettingsContainer = $target.closest("#user-settings-page")
        if ($userSettingsContainer.length) {
            const $selectContainer = $target.closest(".select-container")
            if ($selectContainer.length) {
                const $option = $target.closest(".option")
                if (!$option.length) {
                    e.stopPropagation()
                    $selectContainer.find(".options").toggle()
                    $selectContainer.find(".material-symbols-outlined").toggleClass("rotate")
                    return
                }
            }

            const $colorSelectContainer = $target.closest(".color-select-container")
            if ($colorSelectContainer && $colorSelectContainer.length) {
                const $colorOption = $target.closest(".color")
                if ($colorOption && $colorOption.length) {
                    const color = $colorOption.data("id")
                    updatePrimaryColor(color)
                    localStorage.setItem("primaryColor", color)
                }
            }
        }
    })

    $(document).on("click", "[id^='context-']", function (event) {
        if (event.target.classList.contains("blocked")) return

        const id = $(this).attr("id")
        const options = $(".context-menu").data()

        let op = {}
        switch (id) {
            case "context-play-now":
                op = {
                    op: "addTracks",
                    tracks: [options.selectedtrackid],
                    type: "forcePlay",
                }
                break
            case "context-play-next":
                op = {
                    op: "addTracks",
                    tracks: [options.selectedtrackid],
                    type: "addNext",
                }
                break
            case "context-play-add-to-queue":
                op = {
                    op: "addTracks",
                    tracks: [options.selectedtrackid],
                    type: "addToQueue",
                }
                break
            case "context-skip-to":
                player.skipTo(options.selectedtrackindex)
                return
            case "context-back-to":
                player.backTo(options.selectedtrackindex)
                return
            case "context-remove-track":
                op = {
                    op: "removeTrack",
                    index: options.selectedtrackindex,
                    trackId: options.selectedtrackid,
                }
                break
            case "context-move-top":
                op = {
                    op: "moveTrack",
                    index: options.selectedtrackindex,
                    newIndex: 1,
                }
                break
            case "context-move-bottom":
                op = {
                    op: "moveTrack",
                    index: options.selectedtrackindex,
                    newIndex: player.queue.length + 1,
                }
                break
            case "context-copy-link":
                let text
                if (options?.selectedtrackid) {
                    const track = decode(options.selectedtrackid)
                    text = track?.uri
                } else if (options?.selectedplaylisthref) {
                    text = options?.selectedplaylisthref
                }
                navigator.clipboard.writeText(text)
                player.tm.showToast("success", localeTexts.copyLink)
                return
            case "context-playlist-play-shuffle":
                var $playlistContainer = $(`#playlist-page-${options.selectedplaylistid}`)
                if ($playlistContainer.length) {
                    const tempTracks = $playlistContainer
                        .find(".track-row")
                        .map(function () {
                            return $(this).data("id")
                        })
                        .get()

                    if (tempTracks.length) {
                        shuffleArray(tempTracks)
                        op = {
                            op: "addTracks",
                            tracks: tempTracks,
                            type: "addToQueue",
                        }
                    }
                }
                break
            case "context-get-recommendation":
                buildTrackPage(options.selectedtrackid)
                break
            case "context-get-lyrics":
                var track = decode(options.selectedtrackid)
                var pageId = `lyrics-page-${$("[id^='lyrics-page-']").length}`
                $(".main-container").append(buildLyricHtml(pageId, { title: track.title }))

                op = { op: "getLyrics", title: track.title, callback: pageId }
                changePage(pageId, true)
                break
            case "context-playlist-remove-track":
                op = {
                    op: "updatePlaylist",
                    type: "removeTrack",
                    playlistId: options.selectedplaylistid,
                    trackPosition: options.selectedtrackindex,
                    trackId: options.selectedtrackid,
                }
                break
            case "context-playlist-rename":
                if (player.selectedBot == undefined) {
                    return player.tm.showToast("error", localeTexts.errors.noPlayerError)
                }
                $("html").append(
                    buildModalHtml({
                        type: "renamePlaylist",
                        color: "",
                        dataOptions: {
                            "playlist-id": options.selectedplaylistid,
                        },
                        header: {
                            icon: "bookmark",
                            title: localeTexts.playlist.rename.title,
                            description: localeTexts.playlist.rename.description,
                        },
                        fields: {
                            playlistName: {
                                title: localeTexts.playlist.variable.name,
                                placeholder: localeTexts.playlist.variable.namePlaceholder,
                                inputType: "text",
                                maxLength: 20,
                                disable: false,
                            },
                        },
                        footer: {
                            submit: {
                                text: localeTexts.confirm,
                                color: "",
                            },
                        },
                    })
                )
                break
            case "context-playlist-remove":
                if (player.selectedBot == undefined) {
                    return player.tm.showToast("error", localeTexts.errors.noPlayerError)
                }
                $("html").append(
                    buildModalHtml({
                        type: "deletePlaylist",
                        color: "red",
                        dataOptions: {
                            "playlist-id": options.selectedplaylistid,
                        },
                        header: {
                            icon: "playlist_remove",
                            title: localeTexts.playlist.delete.title,
                            description: localeTexts.playlist.delete.description,
                        },
                        fields: {},
                        footer: {
                            submit: {
                                text: localeTexts.playlist.variable.delete,
                                color: "red",
                            },
                        },
                    })
                )
                break
            case "context-playlist-create":
                if (player.selectedBot == undefined) {
                    return player.tm.showToast("error", localeTexts.errors.noPlayerError)
                }
                op = {
                    op: "updatePlaylist",
                    type: "createPlaylist",
                    playlistName: `link-${options.selectedplaylisthref.slice(-5)}`,
                    playlistUrl: options.selectedplaylisthref,
                }
                break
        }

        if (id.startsWith("context-playlist-add-track")) {
            let playlist_id = $(this).data("id")
            op = {
                op: "updatePlaylist",
                type: "addTrack",
                playlistId: playlist_id,
                trackId: options.selectedtrackid,
            }
        }
        if (op) {
            player.send(op)
        }
    })

    $(document).on("contextmenu", function (e) {
        const $target = $(e.target)
        let options = {}
        let menuItems = []

        // Handle different cases based on the target
        var $card = $target.closest(".card")
        if ($card.length) {
            // Case: Right-click on ".card"
            const cardId = $card.data("id")
            const cardType = $card.data("type")

            if (cardType == "track") {
                options = { selectedTrackId: cardId }
                menuItems = ["playNow", "playNext", "AddToQueue", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"]
            } else if (cardType == "playlist") {
                options = { selectedplaylisthref: $card.data("href") }
                menuItems = ["AddToQueue", "playlistCreate", "copyLink"]
            }
        } else if ($target.closest("#search-result-tracks .track-row").length) {
            // Case: Right-click on "#search-result-tracks .track-row"
            const trackNumber = $target.closest(".track-row").index()
            const selectedTrackId = player.searchList[trackNumber]
            options = { selectedTrackId }
            menuItems = ["playNow", "playNext", "AddToQueue", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"]
        } else if ($target.closest('[id^="playlist-page"] .track-row').length) {
            // Case: Right-click on playlist-page ".track-row"
            const trackRow = $target.closest(".track-row")
            options = {
                selectedTrackId: trackRow.data("id"),
                selectedPlaylistId: trackRow.closest(".sections").data("id"),
                selectedTrackIndex: trackRow.index(".track-rows .track-row"),
            }

            const playlistType = player.playlists[options.selectedPlaylistId]?.type
            if (playlistType && !["link", "share"].includes(playlistType)) {
                menuItems = ["playNow", "playNext", "AddToQueue", "playlistRemoveTrack", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"]
            } else {
                menuItems = ["playNow", "playNext", "AddToQueue", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"]
            }
        } else if ($target.closest("#now-playing-section .track").length) {
            // Case: Right-click on "#now-playing-section .track"
            options = { selectedTrackId: player.currentTrack.trackId }
            menuItems = ["getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"]
        } else if ($target.closest("#queue .track").length) {
            // Case: Right-click on "#queue .track"
            const track = $target.closest(".track")
            options = {
                selectedTrackId: track.data("id"),
                selectedTrackIndex: track.index("#queue .track") + 1,
            }
            menuItems = ["skipTo", "moveTop", "moveEnd", "removeTrack", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"]
        } else if ($target.closest("#history-queue .track").length) {
            // Case: Right-click on "#history-queue .track"
            const track = $target.closest(".track")
            options = {
                selectedTrackId: track.data("id"),
                selectedTrackIndex: track.index("#history-queue .track") + 1,
            }
            menuItems = ["backTo", "getRecommendation", "getLyrics", "playlistAddTrack", "copyLink"]
        }

        // If menu items were determined, prevent default and build the context menu
        if (menuItems.length > 0) {
            e.preventDefault()
            buildContextMenu(e, menuItems, options)
        }
    })

    function buildContextMenu(event, buttonNames, options) {
        const buttonActions = {
            playNow: createActionElement("play_arrow", localeTexts.context.playNow, "context-play-now"),
            playNext: createActionElement("redo", localeTexts.context.playNext, "context-play-next"),
            addToQueue: createActionElement("add_notes", localeTexts.context.addToQueue, "context-play-add-to-queue"),
            removeTrack: createActionElement("do_not_disturb_on", localeTexts.context.removeFromQueue, "context-remove-track", !player.isDJ, true),
            skipTo: createActionElement("skip_next", localeTexts.context.skipTo, "context-skip-to", options.selectedTrackIndex !== 1 || !player.isDJ),
            backTo: createActionElement("skip_previous", localeTexts.context.backTo, "context-back-to", options.selectedTrackIndex !== 1 || !player.isDJ),
            moveTop: createActionElement("text_select_move_up", localeTexts.context.moveToTop, "context-move-top", options.selectedTrackIndex === 1 || !player.isDJ),
            moveEnd: createActionElement(
                "text_select_move_down",
                localeTexts.context.moveToBottom,
                "context-move-bottom",
                options.selectedTrackId === player.queue.at(-1)?.trackId || !player.isDJ
            ),
            copyLink: createActionElement("content_copy", localeTexts.context.copyLink, "context-copy-link"),
            getRecommendation: createActionElement("thumb_up", localeTexts.context.recommendation, "context-get-recommendation"),
            getLyrics: createActionElement("lyrics", localeTexts.context.getLyrics, "context-get-lyrics"),
            playlistShuffle: createActionElement("shuffle", localeTexts.context.playShuffle, "context-playlist-play-shuffle"),
            playlistRemoveTrack: createActionElement("do_not_disturb_on", localeTexts.context.removeTrack, "context-playlist-remove-track", false, true),
            playlistRemove: createActionElement("playlist_remove", localeTexts.playlist.delete.title, "context-playlist-remove"),
            playlistRename: createActionElement("bookmark", localeTexts.playlist.rename.title, "context-playlist-rename"),
            playlistCreate: createActionElement("playlist_add", localeTexts.playlist.create.title, "context-playlist-create"),
            playlistAddTrack: createPlaylistAddTrackElement(),
        }

        var contextMenuHtml = ""
        buttonNames.forEach((btnName) => {
            const action = buttonActions[btnName]
            if (action) {
                contextMenuHtml += action
            }
        })

        showContextMenu(event, contextMenuHtml, options)
    }

    function createActionElement(icon, text, id, isBlocked = false, isAlert = false) {
        const blockedClass = isBlocked ? "blocked" : ""
        const alertClass = isAlert ? "alert" : ""
        return `<div class="row ${alertClass} ${blockedClass}" id="${id}">
                    <span class="material-symbols-outlined ${isBlocked ? "" : "filled"}">${icon}</span>
                    <p>${text}</p>
                </div>`
    }

    function createPlaylistAddTrackElement() {
        let html = `
            <div class="row">
                <div class="btn">
                    <div class="left">
                        <span class="material-symbols-outlined">playlist_add</span>
                        <p>${localeTexts.context.addToPlaylist}</p>
                    </div>
                    <span class="material-symbols-outlined">chevron_right</span>
                </div>
                <div class="sub-menu" id="select-playlist-sub-menu">`

        Object.entries(player.playlists).forEach(([key, value]) => {
            if (value.type === "playlist") {
                html += `<div class="row" id="context-playlist-add-track${key}" data-id="${key}">
                            <p>${value.name}</p>
                        </div>`
            }
        })

        html += `</div></div>`
        return html
    }

    function showContextMenu(e, contextMenuHtml, options) {
        e.preventDefault()
        e.stopPropagation()

        // Remove any existing context menu
        removeContextMenu()

        // Get the window and menu dimensions
        const winWidth = $(window).innerWidth(),
            winHeight = $(window).innerHeight()

        // Create the context menu container dynamically
        const contextMenu = $(`<div class="context-menu"></div>`).html(contextMenuHtml)

        // Append it to the body
        $("body").append(contextMenu)

        const cmWidth = contextMenu.outerWidth(),
            cmHeight = contextMenu.outerHeight()

        let x = e.pageX,
            y = e.pageY

        // Handle sub-menu positioning
        const subMenu = contextMenu.find(".row .sub-menu")
        if (subMenu.length) {
            const smWidth = subMenu.outerWidth() - 5
            if (x > winWidth - cmWidth - smWidth) {
                subMenu.css("left", `-${smWidth}px`)
            } else {
                subMenu.css("left", "")
                subMenu.css("right", `-${smWidth}px`)
            }
        }

        // Adjust position to stay within the viewport
        x = x > winWidth - cmWidth ? winWidth - cmWidth : x
        y = y > winHeight - cmHeight ? winHeight - cmHeight : y

        // Apply position and options
        contextMenu.css({
            left: `${x}px`,
            top: `${y}px`,
            opacity: 1,
            pointerEvents: "auto",
        })

        // Add data attributes from options
        if (options && typeof options === "object") {
            Object.entries(options).forEach(([key, value]) => {
                contextMenu.attr(`data-${key}`, value)
            })
        }

        // Attach scroll event listener to remove the menu on any scrollable container
        $("*").on("scroll.contextMenu", removeContextMenu)
    }

    function buildTrackPage(trackId) {
        let trackPageId = `track-page-${$(".main-container").find('[id^="track-page"]').length}`
        let decodedTrack = decode(trackId)

        $trackPageHtml = $(`<div class="sections" id="${trackPageId}" data-id="${trackId}">
            <div class="section">
                <div class="track-header">
                    <div class="left">
                        <img src="${decodedTrack.artworkUrl}" onerror="this.src='/static/img/notFound.png'" alt="">
                        <div class="track-info">
                            <p class="small">${localeTexts.track.track}</p>
                            <h1 class="large">${decodedTrack.title}</h1>
                            <p class="middle">${decodedTrack.author} • ${msToReadableTime(decodedTrack.length)}</p>
                        </div>
                    </div>
                    <div class="actions">
                        <span class="material-symbols-outlined filled clickable large track-play">play_circle</span>
                        <span class="material-symbols-outlined clickable middle track-more">more_horiz</span>
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="header">
                    <div class="sub-title">
                        <p>${localeTexts.track.description}</p>
                        <h2>${localeTexts.track.title}</h2>
                    </div>
                </div>
                <div class="card-container recommendation-tracks">
                </div>
                <div class="center">
                    <div class="loader"></div>
                </div>
            </div>

            ${getFooterHtml()}
        </div>`)

        $(".main-container").append($trackPageHtml)
        $trackPageHtml.on("scroll", function () {
            let $trackPage = $(this)
            let loader = $trackPage.find(".loader")

            let totalTracks = $trackPage.find(".recommendation-tracks [data-id]").length

            if (totalTracks > maxRecommendationTracks) return

            if ($trackPage.scrollTop() + $trackPage.innerHeight() >= $trackPage[0].scrollHeight * 0.85) {
                if (loader.css("display") === "none") {
                    let recommendationTrack = $trackPage.find(".recommendation-tracks")
                    var elements = recommendationTrack.find("[data-id]")
                    if (elements.length > 0) {
                        loader.fadeIn(150)
                        var randomElement = elements.eq(Math.floor(Math.random() * elements.length))
                        var dataId = randomElement.data("id")
                        player.send({
                            op: "getRecommendation",
                            trackId: dataId,
                            callback: trackPageId,
                        })
                    }
                }
            }
        })

        player.send({
            op: "getRecommendation",
            trackId: trackId,
            callback: trackPageId,
        })
        changePage(trackPageId, true)
    }

    function build_server_page() {
        $(".main-container").append(`
            <div class="sections" id="settings-page" style="display: none">
                <div class="section">
                    <div class="center">
                        <div class="loader"></div>
                    </div>
                </div>
            </div>`)
        player.send({ op: "getMutualGuilds" })
        changePage("settings-page", true)
    }

    function buildExplorePage() {
        if ($("#global-top-tracks").has(".skeleton").length) {
            player.send({
                op: "getTracks",
                query: "https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i",
                callback: "global-top-tracks",
            })
        }
        changePage("explore-page", true, false)
    }

    // --- Mobile Overlay Logic for Menu and Queue ---
    function isMobile() {
        return window.matchMedia("(max-width: 768px)").matches
    }

    function closeAllOverlays() {
        $(".menu-container").removeClass("hide")
        $(".menu-container").removeClass("active")
        $("#menu-overlay").hide()
        $(".queue-container").removeClass("close")
        $(".queue-container").removeClass("active")
        $("#queue-overlay").hide()
    }

    // Initially close overlays on mobile
    if (isMobile()) {
        $(".menu-container").removeClass("hide")
        $(".menu-container").removeClass("active")
        $("#menu-overlay").hide()
        $(".queue-container").removeClass("close")
        $(".queue-container").removeClass("active")
        $("#queue-overlay").hide()
    }

    // Menu toggle button (header menu button)
    $("#menu-bar-btn").on("click", function (e) {
        if (isMobile()) {
            e.stopPropagation()
            closeAllOverlays()
            $(".menu-container").addClass("active")
            $("#menu-overlay").show()
        }
    })

    $(".menu-container").on("click", ".menu-btn", function () {
        if (isMobile()) {
            closeAllOverlays()
        }
    })

    // Queue toggle button (controller queue button)
    $("#toggle-queue-view").on("click", function (e) {
        if (isMobile()) {
            e.stopPropagation()
            closeAllOverlays()
            $(".queue-container").addClass("active")
            $("#queue-overlay").show()
        }
    })

    // Clicking outside menu/queue closes overlays
    $(document).on("click touchstart", function (e) {
        if (!isMobile()) return
        const $target = $(e.target)

        // Close menu if clicking outside of menu and its toggle button, and menu is active
        if (!$target.closest(".menu-container").length && !$target.closest("#menu-bar-btn").length && $(".menu-container").hasClass("active")) {
            closeAllOverlays()
        }

        // Close queue if clicking outside of queue and its toggle button, and queue is active
        if (!$target.closest(".queue-container").length && !$target.closest("#toggle-queue-view").length && $(".queue-container").hasClass("active")) {
            closeAllOverlays()
        }
    })

    // On resize, close overlays if switching between mobile/desktop
    $(window).on("resize", function () {
        if (!isMobile()) {
            closeAllOverlays()
        }
    })
})
