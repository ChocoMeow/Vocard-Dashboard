const EFFECT_ICONS = {
    none: {
        text: localeTexts.effects.tags.none,
        icon: "block",
    },
    karaoke: {
        text: localeTexts.effects.tags.karaoke,
        icon: "mic_external_on",
    },
    tremolo: {
        text: localeTexts.effects.tags.tremolo,
        icon: "earthquake",
    },
    vibrato: {
        text: localeTexts.effects.tags.vibrato,
        icon: "vibration",
    },
    rotation: {
        text: localeTexts.effects.tags.rotation,
        icon: "360",
    },
    distortion: {
        text: localeTexts.effects.tags.distortion,
        icon: "adaptive_audio_mic",
    },
    lowpass: {
        text: localeTexts.effects.tags.lowpass,
        icon: "adaptive_audio_mic",
    },
    nightcore: {
        text: localeTexts.effects.tags.nightcore,
        icon: "dark_mode",
    },
    "8d": {
        text: localeTexts.effects.tags.eightD,
        icon: "360",
    },
    vaporwave: {
        text: localeTexts.effects.tags.vaporwave,
        icon: "block",
    },
};

class Timer {
    constructor(callback, interval) {
        this.callback = callback;
        this.interval = interval;
        this.timerId = null;
        this.isRunning = false;
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.timerId = setInterval(() => {
                this.callback();
            }, this.interval);
        }
    }

    stop() {
        if (this.isRunning) {
            clearInterval(this.timerId);
            this.timerId = null;
            this.isRunning = false;
        }
    }

    getIsRunning() {
        return this.isRunning;
    }
}

class ToastManager {
    constructor(player) {
        this.player = player;
        this.queue = [];
        this.isShowing = false;
        this.fancyAlerts = {
            show: function (options) {
                var $alert = $(`
                    <div class="alert-msg ${options.type}">
                        <div class="">
                            <img class="alert-msg--icon" src="${options.avatarUrl}">
                            <div class="alert-msg--content">
                                <p class="alert-msg--words">${options.msg}</p>
                            </div>
                        </div>
                    </div>
                `);

                $(".control-container").prepend($alert);
                setTimeout(function () {
                    $alert.addClass("alert-msg__active");
                }, 100);

                setTimeout(function () {
                    $alert.addClass("alert-msg__extended");
                }, 500);

                if (options.timeout) {
                    this.hide(options.timeout);
                }

                $alert.on("fancyAlertClosed", function () {
                    options.onClose();
                });
            },
            hide: function (_delay) {
                var delay = _delay || 0;

                var $alert = $(".alert-msg");
                setTimeout(function () {
                    setTimeout(function () {
                        $alert.removeClass("alert-msg__extended");
                    }, 10);

                    setTimeout(function () {
                        $alert.removeClass("alert-msg__active");
                    }, 500);

                    setTimeout(function () {
                        $alert.trigger("fancyAlertClosed");
                        $alert.remove();
                    }, 700);
                }, delay);
            },
        };
    }

    showToast(userId, msg) {
        if (userId == undefined) return;
        this.queue.push({ userId, msg });
        if (!this.isShowing) {
            this.processQueue();
        }
    }

    processQueue() {
        if (this.queue.length === 0 || this.isShowing) {
            return;
        }
        this.isShowing = true;
        const { userId, msg } = this.queue.shift();

        let avatarUrl;
        let type;
        if (["info", "error", "success"].includes(userId)) {
            avatarUrl = `/static/img/${userId}.png`;
            type = userId;
        } else {
            avatarUrl = this.player.users[userId]?.avatarUrl || '/static/img/notFound.png';
            type = "success";
        }

        this.fancyAlerts.show({
            type: type,
            msg: msg,
            avatarUrl: avatarUrl,
            timeout: this.queue.length == 0 ? 5000 : 2000,
            onClose: () => {
                this.isShowing = false;
                this.processQueue();
            },
        });
    }
}

class Track {
    constructor(object, requester) {
        this.title = object.title;
        this.author = object.author;
        this.source = object.source;
        this.identifier = object.identifier;
        if (object.artworkUrl == undefined) {
            if (this.source == "youtube") {
                this.artworkUrl = `https://img.youtube.com/vi/${this.identifier}/hqdefault.jpg`;
            } else {
                this.artworkUrl =
                    "https://cdn.discordapp.com/attachments/674788144931012638/823086668445384704/eq-dribbble.gif";
            }
        } else {
            this.artworkUrl = object.artworkUrl;
        }
        this.isStream = object.isStream;
        this.length = Number(object.length);
        this.trackId = object.trackId;
        this.uri = object.uri;
        this.requester = requester;
    }
}

class Bot {
    constructor(params) {
        this.avatar = params.botAvatar;
        this.name = params.botName;
        this.id = params.botId.toString();
    }
}

const methods = {
    closeConnection: function (player, data) {
        updateWarningBar(true);
        changePage("bot-not-found");
        player.updateSelectedBot(null);
    },

    rateLimited: function (player, data) {
        changePage("rate-limited");
    },

    botNotFound: function (player, data) {
        changePage("bot-not-found");
    },

    initBot: function (player, data) {
        const bot = new Bot(data);
        if (!player.bots.has(bot.id)) {
            player.bots.set(bot.id, bot);
        }
        let selectedBotId = localStorage.getItem("selectedBot");
        if (
            player.selectedBot == null &&
            (selectedBotId == undefined || bot.id == selectedBotId)
        ) {
            player.updateSelectedBot(bot.id);
        }
        player.updateSelectedBotView();
    },

    initUser: function (player, data) {
        var historyTracks = $("#history-tracks");
        historyTracks.empty();
        player.userId = data.userId;

        if (!data.data.history.length) {
            changePage("no-history-found");
        } else {
            changePage("main-page");
            const uniqueArray = [...new Set(data.data.history)].reverse();

            const tracks = uniqueArray.map((trackId) => {
                let track = decode(trackId);
                return track;
            });

            const uniqueTracks = [];
            const seenUris = new Set();

            for (const track of tracks) {
                if (!seenUris.has(track.uri)) {
                    seenUris.add(track.uri);
                    uniqueTracks.push(track);
                }
            }

            for (var track of uniqueTracks) {
                historyTracks.append(buildTrackCardHtml(track));
            }

            var elements = $("#history-tracks, #recommendation-tracks").find(
                "[data-id]"
            );
            var loader = $("#recommendation-tracks-loader");
            if (loader.css("display") !== "none" && elements.length > 0) {
                var randomElement = elements.eq(
                    Math.floor(Math.random() * elements.length)
                );
                var dataId = randomElement.data("id");
                player.send({
                    op: "getRecommendation",
                    trackId: dataId,
                    callback: "main-page",
                });
            }
        }

        player.playlists = data.data.playlist;
        player.inboxes = data.data.inbox;
        player.updatePlaylistSelector();
        player.updateInboxList();
    },

    initPlayer: function (player, data) {
        player.init();
        player.guildId = data.guildId;
        data["users"].forEach((user) => {
            player.addUser(user);
        });
        player.queue.push(
            ...(data.tracks
                .map((track) => {
                    try {
                        return decode(
                            track?.trackId,
                            player.users[track?.requesterId]
                        );
                    } catch (error) {
                        console.error(
                            `Failed to decode track id ${track?.trackId}: ${error}`
                        );
                        return null;
                    }
                })
                .filter((track) => track !== null) || [])
        );
        player.isDJ = data?.isDj;
        player.updateCurrentQueuePos(data?.currentQueuePosition);
        player.isPaused = data?.isPaused;
        player.currentPosition = data?.currentPosition;
        player.repeat = data?.repeatMode;
        player.channelName = data?.channelName;
        player.autoplay = data?.autoplay;
        player.updateBar(player.volumeBar, data?.volume, data?.volume);
        player.isDJ
            ? player.volumeBar.removeAttr("disabled")
            : player.volumeBar.attr("disabled", "disabled");
        player.updateChannelMemberView();

        player.availableFilters = data?.availableFilters;
        player.filters = data?.filters;
        player.updateFilterView();

        $("#queue").sortable({
            animation: 150,
            ghostClass: "sortable-ghost",
            chosenClass: "sortable-chosen",
            disabled: !data?.isDj,

            onEnd: function (evt) {
                let index = evt.oldIndex + 1;
                let newIndex = evt.newIndex + 1;
                if (index != newIndex) {
                    player.send({
                        op: "moveTrack",
                        index: evt.oldIndex + 1,
                        newIndex: evt.newIndex + 1,
                    });
                }
            },
        });
    },

    getRecommendation: function (player, data) {
        const region = $(`#${data.callback}`);
        const recommendationTrack = region.find(".recommendation-tracks");
        region.find(".loader").fadeOut(150);

        const existingTrackIds = new Set(
            recommendationTrack
                .find("[data-id]")
                .map(function () {
                    return $(this).data("id");
                })
                .get()
        );

        data.tracks.forEach((trackId) => {
            // Skip if the track is already in the recommendation list
            if (existingTrackIds.has(trackId)) return;

            const track = decode(trackId);

            // Append the new track
            recommendationTrack.append(buildTrackCardHtml(track));
        });
    },

    getLyrics: function (player, data) {
        if (Object.keys(data.lyrics).length === 0) {
            changePage("no-lyrics-found");
        } else {
            pageId = data.callback;
            $(`#${pageId}`).replaceWith(buildLyricHtml(pageId, data));
        }
    },

    playerUpdate: function (player, data) {
        player.lastUpdate = data["lastUpdate"];
        player.isConnected = data["isConnected"];
        player.currentPosition = data["lastPosition"];
    },

    trackUpdate: function (player, data) {
        let track = player.updateCurrentQueuePos(data["currentQueuePosition"]);
        player.isPaused = data["isPaused"];
        if (track?.trackId != data["trackId"]) {
            player.send({ op: "initPlayer" });
        }
    },

    addTrack: function (player, data) {
        let tracks = data.tracks
            .map((trackId) => {
                try {
                    return decode(trackId, player.users[data?.requesterId]);
                } catch (error) {
                    console.error(
                        `Failed to decode track id ${trackId}: ${error}`
                    );
                    return null;
                }
            })
            .filter((track) => track !== null);

        if (data.tracks.length == 1) {
            var msg = formatString(
                localeTexts.addTrack,
                decode(data.tracks[0]).title
            );
        } else {
            var msg = formatString(localeTexts.addMultipleTrack, tracks.length);
        }
        player.tm.showToast(data["requesterId"], msg);

        if (data.position >= 1 && player.isPlaying) {
            player.queue.splice(
                player.currentQueuePosition + data.position,
                0,
                ...tracks
            );
        } else {
            player.queue.push(...tracks);
        }
        player.updateCurrentQueuePos();
    },

    getTracks: function (player, data) {
        let callback = data?.callback;
        let tracks = data?.tracks;

        if (tracks == undefined) return;

        const region = $(`#${callback}`);

        if (callback == "search-result-tracks") {
            $("#result-count").text(`${localeTexts.resultsFoundCount}: ${tracks.length}`);
            region.empty();
            player.searchList = tracks;
            for (let i in tracks) {
                let track = decode(tracks[i]);
                region.append(`
                    <div class="track-row">
                        <div class="left">
                            <img src="${
                                track.artworkUrl
                            }" onerror="this.src='/static/img/notFound.png'" alt="">
                            <div class="track-info">
                                <p class="title">${track.title}</p>
                                <p class="description">${track.author}</p>
                            </div>
                        </div>
                        <p>${
                            track.isStream
                                ? "LIVE"
                                : msToReadableTime(track.length)
                        }</p>
                    </div>`);
            }
            $(".search-result").fadeIn(200);
            $("#search-loader").fadeOut(200);
            $("#search-result-tracks").animate({ scrollTop: 0 }, "slow");
        } else if (callback.startsWith("playlist-page-")) {
            selectedPlaylistPayload.tracks = tracks;
            region.replaceWith(
                buildPlaylistHtml(
                    callback.replace("playlist-page-", ""),
                    selectedPlaylistPayload,
                    "playlist"
                )
            );
        } else {
            region.empty();

            data.tracks.forEach((trackId) => {
                const track = decode(trackId);

                // Append the new track
                region.append(buildTrackCardHtml(track));
            });
        }
    },

    playerClose: function (player, data) {
        player.init();
    },

    updateGuild: function (player, data) {
        const user = data["user"];
        player.channelName = data["channelName"];

        if (data["isJoined"]) {
            player.addUser(user);
        } else {
            if (player.users.hasOwnProperty(user["userId"])) {
                delete player.users[user["userId"]];
            }
        }
        player.updateChannelMemberView();
    },

    updatePause: function (player, data) {
        player.isPaused = data["pause"];
        player.tm.showToast(
            data["requesterId"],
            player.isPaused ? localeTexts.paused : localeTexts.resumed
        );
    },

    updatePosition: function (player, data) {
        const position = msToReadableTime(data.position);
        player.tm.showToast(
            data.requesterId,
            formatString(
                data.position >= player.currentPosition
                    ? localeTexts.forward
                    : localeTexts.rewind,
                position
            )
        );
        player.currentPosition = data.position;
    },

    updateVolume: function (player, data) {
        player.updateBar(player.volumeBar, data?.volume, data?.volume);
        player.tm.showToast(
            data.requesterId,
            formatString(localeTexts.volume, data?.volume)
        );
    },

    swapTrack: function (player, data) {
        const { index1: firstTrackData, index2: secondTrackData } = data;

        const firstTrackIndex =
            player.currentQueuePosition + firstTrackData.index;
        const secondTrackIndex =
            player.currentQueuePosition + secondTrackData.index;

        const firstTrack = player.queue.at(firstTrackIndex);
        const secondTrack = player.queue.at(secondTrackIndex);

        if (
            firstTrack.trackId != secondTrackData.trackId ||
            secondTrack.trackId != firstTrackData.trackId
        ) {
            return player.send({ op: "initPlayer" });
        }

        [player.queue[firstTrackIndex], player.queue[secondTrackIndex]] = [
            player.queue[secondTrackIndex],
            player.queue[firstTrackIndex],
        ];
        player.tm.showToast(
            data["requesterId"],
            formatString(
                localeTexts.swapTrack,
                firstTrack.title,
                secondTrack.title
            )
        );
        player.updateCurrentQueuePos();
    },

    moveTrack: function (player, data) {
        let movedTrack = data?.movedTrack;
        let newIndex = data?.newIndex;

        let element = player.queue.splice(
            player.currentQueuePosition + movedTrack?.index,
            1
        )[0];
        if (element?.trackId != movedTrack?.trackId) {
            return player.send({ op: "initPlayer" });
        }
        player.queue.splice(player.currentQueuePosition + newIndex, 0, element);
        player.tm.showToast(
            data["requesterId"],
            formatString(localeTexts.moveTrack, element.title, newIndex)
        );
        player.updateCurrentQueuePos();
    },

    shuffleTrack: function (player, data) {
        const tracks = data?.tracks;
        const queueType = data?.queueType;

        if (!tracks) return;

        const decodedTrack = (track) => {
            try {
                return decode(track?.trackId, player.users[track?.requesterId]);
            } catch (error) {
                console.error(
                    `Failed to decode track id ${track?.trackId}: ${error}`
                );
                return null;
            }
        };

        if (queueType === "queue") {
            player.queue.splice(player.currentQueuePosition + 1);
            player.queue.push(
                ...tracks.map(decodedTrack).filter((track) => track !== null)
            );
        } else {
            player.queue.splice(
                0,
                player.currentQueuePosition,
                ...tracks.map(decodedTrack).filter((track) => track !== null)
            );
        }

        player.tm.showToast(
            data.requesterId,
            formatString(localeTexts.shuffleTracks, capitalize(queueType))
        );
        player.updateCurrentQueuePos();
    },

    repeatTrack: function (player, data) {
        player.repeat = data.repeatMode;
        player.tm.showToast(
            data["requesterId"],
            formatString(localeTexts.repeatTrack, data.repeatMode)
        );
    },

    removeTrack: function (player, data) {
        const indexes = data.indexes;
        const firstTrackId = data.firstTrackId;

        if (player.queue.at(indexes[0]).trackId !== firstTrackId) {
            player.send({ op: "initPlayer" });
        }

        for (let i = indexes.length - 1; i >= 0; i--) {
            player.queue.splice(indexes[i], 1);
        }

        if (indexes.length == 1) {
            var msg = formatString(
                localeTexts.removeTrack,
                decode(firstTrackId).title
            );
        } else {
            var msg = formatString(localeTexts.removeMultiple, indexes.length);
        }
        player.tm.showToast(data["requesterId"], msg);
        player.updateCurrentQueuePos();
    },

    clearQueue: function (player, data) {
        let queueType = data?.queueType;
        if (queueType === "queue") {
            // Clear all tracks after the current position
            player.queue.splice(
                player.currentQueuePosition + 1,
                player.queue.length - (player.currentQueuePosition + 1)
            );
        } else if (queueType === "history") {
            // Ensure current position is valid and clear history
            if (player.currentQueuePosition > 0) {
                player.queue.splice(0, player.currentQueuePosition);
                player.currentQueuePosition = 0;
            }
        }

        player.tm.showToast(
            data["requesterId"],
            formatString(localeTexts.clearQueue, data.queueType)
        );
        player.updateCurrentQueuePos();
    },

    toggleAutoplay: function (player, data) {
        player.autoplay = data.status;
        player.tm.showToast(
            data["requesterId"],
            formatString(
                localeTexts.autoplay,
                player.autoplay ? localeTexts.enabled : localeTexts.disabled
            )
        );
    },

    loadPlaylist: function (player, data) {
        var playlist = player.playlists[data.playlistId];
        playlist.tracks = data.tracks;
        $(`#playlist-page-${data.playlistId}`).replaceWith(
            buildPlaylistHtml(data.playlistId, playlist, "user-playlist")
        );
    },

    updatePlaylist: function (player, data) {
        let status = data.status;

        if (status == "created") {
            player.playlists[data.playlistId] = data.data;
            player.updatePlaylistSelector();
            player.tm.showToast("success", data.msg);
            closeAllModals();
        } else if (status == "deleted") {
            delete player.playlists[data.playlistId];
            player.updatePlaylistSelector();
            backToLastPage();
            player.tm.showToast("success", data.msg);
            closeAllModals();
        } else if (status == "renamed") {
            player.playlists[data.playlistId].name = data.name;
            player.updatePlaylistSelector();
            player.tm.showToast("success", data.msg);
            closeAllModals();
        } else if (status == "error") {
            let $errorSection = $(
                `.modal-container .section[data-id="${data.field}"]`
            );
            $errorSection.addClass("error");
            $errorSection.find(".error-msg").text(data.msg);
        } else if (status == "addTrack") {
            if (data.playlistId in player.playlists) {
                player.playlists[data.playlistId]?.tracks.push(data.trackId);
                player.tm.showToast("success", data.msg);
            }
        } else if (status == "removeTrack") {
            if (data.playlistId in player.playlists) {
                let trackId =
                    player.playlists[data.playlistId]?.tracks[
                        data.trackPosition
                    ];
                if (trackId != data.trackId) return;

                player.playlists[data.playlistId]?.tracks.splice(
                    data.trackPosition,
                    1
                );
                $(`#playlist-page-${data.playlistId}`).replaceWith(
                    buildPlaylistHtml(
                        data.playlistId,
                        player.playlists[data.playlistId],
                        "user-playlist"
                    )
                );
                player.tm.showToast("success", data.msg);
            }
        } else if (status == "updateInbox") {
            if (data?.accept) {
                player.playlists[data.playlistId] = data.data;
                player.updatePlaylistSelector();
                player.tm.showToast("success", data.msg);
            }

            player.inboxes = player.inboxes.filter(
                (mail) =>
                    mail.sender.id !== data.senderId &&
                    mail.referId !== data.referId
            );
            player.updateInboxList();
        }

        player.updateCurrentQueuePos();
    },

    getMutualGuilds: function (player, data) {
        const $settingsPage = $("#settings-page");

        const createServerCard = (serverId, serverData, isInvite = false) => {
            return `
                <div class="server-card ${
                    isInvite ? "" : "access-server-settings"
                }" data-id="${serverId}">
                    <div class="banner">
                        <img src="${
                            serverData.banner
                        }" onerror="this.src='/static/img/default-banner.svg'" alt="">
                    </div>
                    <div class="info">
                        <img class="server-icon" src="${
                            serverData.avatar
                        }" onerror="this.src='/static/img/notFound.png'" alt="">
                        <div class="server-info">
                            <p class="title">${serverData.name}</p>
                            <p class="description">${
                                isInvite
                                    ? localeTexts.settings.variable.inviteText
                                    : `${serverData.memberCount}&nbsp;${localeTexts.settings.variable.membersText}`
                            }</p>
                        </div>
                    </div>
                    <div class="action-info">
                        <span class="material-symbols-outlined">${
                            isInvite ? "add" : "construction"
                        }</span>
                    </div>
                </div>`;
        };

        let html = "";

        if (player.guildId !== null && data.mutualGuilds[player.guildId]) {
            const serverData = data.mutualGuilds[player.guildId];
            html += `
                <div class="section">
                    <div class="header">
                        <div class="sub-title">
                            <h2>${localeTexts.settings.variable.header1}</h2>
                        </div>
                    </div>
                    <div class="server-cards">
                        ${createServerCard(player.guildId, serverData)}
                    </div>
                </div>`;
        }

        // My Servers Section
        html += `
            <div class="section">
                <div class="header">
                    <div class="sub-title">
                        <p>${localeTexts.settings.variable.description2}</p>
                        <h2>${localeTexts.settings.variable.header2}</h2>
                    </div>
                </div>
                <div class="server-cards">
                    ${Object.entries(data.mutualGuilds)
                        .map(([serverId, serverData]) => {
                            if (player.guildId && player.guildId === serverId)
                                return "";
                            return createServerCard(serverId, serverData);
                        })
                        .join("")}
                </div>
            </div>`;

        // Invite Bot Section
        html += `
            <div class="section">
                <div class="header">
                    <div class="sub-title">
                        <p>${localeTexts.settings.variable.description3}</p>
                        <h2>${localeTexts.settings.variable.header3}</h2>
                    </div>
                </div>
                <div class="server-cards">
                    ${Object.entries(data.inviteGuilds)
                        .map(
                            ([serverId, serverData]) => `
                        <a href="${`https://discord.com/oauth2/authorize?client_id=${player.selectedBot.id}&permissions=2184538176&scope=bot%20applications.commands`}" target="_blank" rel="noopener noreferrer">
                            ${createServerCard(serverId, serverData, true)}
                        </a>
                    `
                        )
                        .join("")}
                </div>
            </div>`;
        
        html += getFooterHtml();
        $settingsPage.html(html);
    },

    getSettings: function (player, data) {
        player.currentSettings = data;
        $(`#server-page-${data.guild.id}`).replaceWith(
            buildSettingPageHtml(data.guild.id, {
                guild: data.guild,
                fields: {
                    prefix: {
                        title: localeTexts.settings.prefix.title,
                        description: localeTexts.settings.prefix.description,
                        placeholder: "?",
                        default: data.settings.prefix,
                        inputType: "text",
                        maxLength: 3,
                        optionClasses: [],
                    },
                    lang: {
                        title: localeTexts.settings.language.title,
                        description: localeTexts.settings.language.description,
                        default: data.settings.lang,
                        options: data.options.languages,
                        inputType: "dropdown",
                        optionClasses: [],
                    },
                    queueType: {
                        title: localeTexts.settings.queueType.title,
                        description: localeTexts.settings.queueType.description,
                        default: data.settings.queueType,
                        options: data.options.queueModes,
                        inputType: "dropdown",
                        optionClasses: [],
                    },
                    dj: {
                        title: localeTexts.settings.dj.title,
                        description: localeTexts.settings.dj.description,
                        default: data.settings.dj,
                        options: data.options.roles,
                        inputType: "dropdown",
                        optionClasses: [],
                    },
                    "24/7": {
                        title: localeTexts.settings._247.title,
                        description: localeTexts.settings._247.description,
                        default: data.settings["24/7"],
                        inputType: "switch",
                        optionClasses: [],
                    },
                    votedisable: {
                        title: localeTexts.settings.voteDisable.title,
                        description:
                            localeTexts.settings.voteDisable.description,
                        default: data.settings?.votedisable,
                        inputType: "switch",
                        optionClasses: [],
                    },
                    controller: {
                        title: localeTexts.settings.controller.title,
                        description:
                            localeTexts.settings.controller.description,
                        default: data.settings?.controller,
                        inputType: "switch",
                        optionClasses: [],
                    },
                    duplicateTrack: {
                        title: localeTexts.settings.duplicateTrack.title,
                        description:
                            localeTexts.settings.duplicateTrack.description,
                        default: data.settings?.duplicateTrack,
                        inputType: "switch",
                        optionClasses: [],
                    },
                    stage_announce_template: {
                        title: localeTexts.settings.stageAnnounceTemplate.title,
                        description:
                            localeTexts.settings.stageAnnounceTemplate
                                .description,
                        default: data.settings.stage_announce_template,
                        inputType: "text",
                        optionClasses: ["long-input"],
                    },
                },
            })
        );
    },

    updateFilter: function (player, data) {
        if (data?.type === "reset") {
            player.filters = [];
            player.tm.showToast(data["requesterId"], localeTexts.effects.reset);
        } else {
            let index = player.filters.findIndex(
                (filter) => filter.tag === data.filter.tag
            );
            if (data?.type === "add") {
                if (index !== -1) {
                    player.filters[index] = data.filter;
                } else {
                    player.filters.push(data.filter);
                }
                player.tm.showToast(
                    data["requesterId"],
                    formatString(localeTexts.effects.add, data.filter.tag)
                );
            } else if (data?.type == "remove") {
                if (index !== -1) {
                    player.filters.splice(index, 1);
                    player.tm.showToast(
                        data["requesterId"],
                        formatString(
                            localeTexts.effects.remove,
                            data.filter.tag
                        )
                    );
                }
            }
        }

        player.updateFilterView();
    },

    getFeaturedPlaylists: function (player, data) {
        const region = $(`#${data.callback}`);
        region.empty();

        data.playlists.forEach((playlist) => {
            // Append the new playlist
            region.append(buildPlaylistCardHtml(playlist));
        });
    },

    getCategoryPlaylists: function (player, data) {
        const region = $(`#${data.callback}`);
        region.empty();

        data.playlists.forEach((playlist) => {
            // Append the new playlist
            region.append(buildPlaylistCardHtml(playlist));
        });
    },

    errorMsg: function (player, data) {
        player.tm.showToast(data["level"], data["msg"]);
    },
};

class Player {
    constructor() {
        this.socket = new Socket(
            this,
            `${window.location.protocol === "https:" ? "wss" : "ws"}://${
                window.location.hostname
            }:${window.location.port}/ws_user`
        );
        this.socket.connect(this);
        this.socket.addMessageListener((msg) => this.handleMessage(msg));
        this.tm = new ToastManager(this);
        this.timer = new Timer(() => this.updateTime(), 1000);
        this.userId = null;
        this.isDJ = false;
        this.date = new Date();
        this.queue = [];

        this.guildId = null;
        this.users = {};
        this.searchList = [];
        this.repeat = "off";
        this.currentTrack = null;
        this.currentQueuePosition = 0;
        this.currentPosition = 0;
        this.isPaused = false;
        this.volume = 100;
        this.lastUpdate = 0;
        this.isConnected = true;
        this.autoplay = false;

        this.bots = new Map();
        this.selectedBot = null;

        this.channelName = "";
        this.playlists = [];
        this.inboxes = [];

        this.currentSettings = {};
        this.modifySettings = {};

        this.filters = [];
        this.availableFilters = [];

        this.positionBar = $("#position-bar");
        this.volumeBar = $("#volume-bar");
        this.likeBtn = $("#like-btn");
        this.startTime = $("#start-time");

        this.updateFilterView();
    }

    handleMessage(msg) {
        const data = JSON.parse(msg);
        const op = data.op;
        const validMethods = Object.keys(methods);

        if (validMethods.includes(op)) {
            methods[op](this, data);
        } else {
            console.log(`Invalid action: ${op}`);
        }

        return this.updateInfo();
    }

    init() {
        this.isDJ = false;
        this.date = new Date();
        this.queue = [];

        this.guildId = null;
        this.users = {};
        this.repeat = "off";
        this.currentTrack = null;
        this.currentQueuePosition = 0;
        this.currentPosition = 0;
        this.isPaused = false;
        this.volume = 100;
        this.lastUpdate = 0;
        this.isConnected = true;
        this.autoplay = false;
        this.channelName = "";
        this.filters = [];

        this.updateCurrentQueuePos();
        this.updateSelectedBotView();
        this.updateChannelMemberView();
        this.updateFilterView();
        this.updateInfo();
    }

    addUser(user) {
        this.users[user["userId"]] = { ...user };
    }

    togglePause() {
        this.send({ op: "updatePause", pause: !this.isPaused });
    }

    skipTo(index = 1) {
        this.send({ op: "skipTo", index: index });
    }

    backTo(index = 1) {
        this.send({ op: "backTo", index: index });
    }

    seekTo(tempPosition) {
        this.send({ op: "updatePosition", position: Math.trunc(tempPosition) });
    }

    shuffle() {
        if (this.queue.length - this.currentQueuePosition > 3) {
            this.send({ op: "shuffleTrack" });
        } else {
            this.tm.showToast(
                "info",
                localeTexts.errors.noEnoughTrackToShuffle
            );
        }
    }

    repeatMode() {
        this.send({ op: "repeatTrack" });
    }

    send(payload) {
        this.socket.send(payload);
    }

    isPlaying() {
        return this.currentTrack != undefined && this.isConnected;
    }

    updateSelectedBot(botId) {
        if (botId == null) {
            $(".bot-selection .selected .left").html(`<p></p>`);
            this.selectedBot = null;
        } else {
            var botId = botId.toString();
            var bot = this.bots.get(botId);
            if (bot != undefined) {
                $(".bot-selection .selected .left").html(
                    `<img src="${bot?.avatar}" alt=""><p>${bot?.name}</p>`
                );
                localStorage.setItem("selectedBot", botId);
                this.send({ op: "updateSelectedBot", botId: botId });
                this.selectedBot = bot;
            } else {
                this.tm.showToast("error", localeTexts.errors.selectBotError);
            }
        }
        this.updateSelectedBotView();
    }

    updateSelectedBotView() {
        let $view = $(".bot-selection .options");
        $view.empty();
        this.bots.forEach((value, key) => {
            if (value !== this.selectedBot) {
                $view.append(
                    `<div class="option" data-id="${value.id}">
                        <img src="${value.avatar}" alt="">
                        <p>${value.name}</p>
                    </div>`
                );
            }
        });
    }

    updateFilterView() {
        const filterView = $("#effect-panel");
        const isEnabled = this.filters.length != 0;

        let options = `
            <div class="option ${isEnabled ? "" : "active"}" data-id="none">
                <span class="material-symbols-outlined">block</span>
                <p>${localeTexts.effects.tags.none}</p>
            </div>
        `;

        this.availableFilters.forEach((element) => {
            const isActive = this.filters.some(
                (filter) => filter.tag === element.tag
            );
            const { icon = "help", text = "Unknown Effect" } =
                EFFECT_ICONS[element.tag] || {};

            options += `
                <div class="option ${isActive ? "active" : ""}" data-id="${
                element.tag
            }">
                    <span class="material-symbols-outlined">${icon}</span>
                    <p>${capitalize(text)}</p>
                </div>`;
        });

        filterView.html(`
            <div class="section" style="position: sticky;">
                <div class="info">
                    <h4>${localeTexts.effects.header}</h4>
                    <p>${localeTexts.effects.description}</p>
                </div>
            </div>

            <div class="options">${options}</div>
            <div class="control"></div>
        `);
    }

    updatePlaylistSelector() {
        let playlistSelector = $("#playlist-selector");
        playlistSelector.empty();
        Object.entries(this.playlists).forEach(([key, value]) => {
            playlistSelector.append(
                `<div class="menu-btn no-icon" id="menu-playlist-page-${key}" data-id="${key}">
                    <p>${value.name}</p>
                </div>`
            );
        });
    }

    updateCurrentQueuePos(pos) {
        const togglePlayNextSection = () => {
            const $playNextSection = $("#play-next-section");
            const shouldShow =
                this.queue.length - 1 > this.currentQueuePosition &&
                !$("#history-section").is(":visible");
            shouldShow ? $playNextSection.fadeIn() : $playNextSection.fadeOut();
        };

        if (pos !== undefined) {
            this.currentQueuePosition = pos - 1;
        }

        this.currentTrack = this.queue[this.currentQueuePosition];
        const $historySection = $("#history-section");
        const $nowPlayingSection = $("#now-playing-section");

        // Show or hide now playing section
        this.currentTrack
            ? $nowPlayingSection.fadeIn()
            : $nowPlayingSection.fadeOut();

        // Handle history section visibility
        if (this.currentQueuePosition < 1) {
            $historySection.fadeOut(200, () => {
                togglePlayNextSection();
            });
        } else {
            togglePlayNextSection();
        }

        // Update like button and position bar
        const isTrackInPlaylist = this.playlists?.["200"]?.["tracks"]?.includes(
            this.currentTrack?.trackId
        );
        this.likeBtn.toggleClass("filled", isTrackInPlaylist);
        this.positionBar.attr(
            "disabled",
            this.currentTrack?.isStream ? "disabled" : false
        );
        
        this.updateImage("#controller-img", this.currentTrack?.artworkUrl);
        this.updateImage("#now-playing-img", this.currentTrack?.artworkUrl);
        this.updateImage(
            "#now-playing-requester-img",
            this.currentTrack?.requester?.avatarUrl || '/static/img/notFound.png'
        );

        const colorThief = new ColorThief();
        const $img = $("#controller-img").clone();

        $(".main-grid-container").css("box-shadow", ``);
        if (this.currentTrack && this.currentTrack.source == "spotify") {
            $img[0].crossOrigin = "anonymous";

            $img.on("load", function () {
                const dominantColor = colorThief.getColor(this);
                let adjustedColor = dominantColor;

                if (
                    localStorage.getItem("theme") != "light" &&
                    !isDarkColor(dominantColor)
                ) {
                    adjustedColor = darkenColor(dominantColor, 0.3); // Darken by 30%
                }

                const rgbString = `rgba(${adjustedColor.join(",")}, 0.6)`;
                $(".main-grid-container").css({
                    "box-shadow": `inset 0 -90px 30px ${rgbString}`,
                });
            });
        }

        this.updateQueueList();
        return this.currentTrack;
    }

    updateInboxList() {
        const $inboxPanel = $("#inbox-panel .sections");
        $("#toggle-inbox-panel .btn").toggleClass(
            "active",
            this.inboxes.length > 0
        );
        $inboxPanel.empty();
        this.inboxes.forEach((mail) => {
            if (mail?.type !== "invite") return;

            let date = new Date(mail?.time * 1000);

            $inboxPanel.append(`
                <div class="message" data-id="${mail?.sender?.id}-${
                mail?.referId
            }">
                    <div>
                        <img src="${mail?.sender?.avatarUrl}"
                            alt="">
                    </div>
                    <div>
                        <p class="title">${mail?.title}</p>
                        <p class="time">${date.toDateString()} • ${date.toLocaleTimeString()}</p>
                        <p class="description">${mail?.description.replace(
                            "\n",
                            "<br>"
                        )}</p>
                        <div class="actions">
                            <p class="action accept">${localeTexts.accept}</p>
                            <p class="action">${localeTexts.cancel}</p>
                        </div>
                    </div>
                </div>`);
        });

        if (!this.inboxes.length) {
            $inboxPanel.append(`
                <div class="no-message">
                    <img src="/static/img/noMessage.svg" alt="">
                    <p>${localeTexts.errors.noInboxMessage}</p>
                </div>`);
        }
    }

    updateQueueList() {
        removeContextMenu();
        $("#queue").html(
            this.queue
                .slice(this.currentQueuePosition + 1)
                .map((track) => buildQueueTrackHtml(track))
        );

        $("#history-queue").html(
            this.queue
                .slice(0, this.currentQueuePosition)
                .reverse()
                .map((track) => buildQueueTrackHtml(track))
                .join("")
        );
    }

    updateTime() {
        const trackLength = this.currentTrack?.length ?? 0;

        if (!this.currentTrack || this.currentPosition >= trackLength) {
            this.startTime.text("00:00");
            this.updateBar(this.positionBar, 0, 0);
            return this.timer.stop();
        }

        if (this.currentTrack?.isStream) {
            this.startTime.text("∞");
            this.updateBar(this.positionBar, 500, 100);
            return this.timer.stop();
        }

        this.currentPosition += 1000;
        this.startTime.text(msToReadableTime(this.currentPosition));

        const time = (this.currentPosition / trackLength) * 500;
        const progress = (time / this.positionBar.attr("max")) * 100;

        this.updateBar(this.positionBar, time, progress);
    }

    updateBar(bar, time, progress) {
        bar.val(time);
        bar.css(
            "background",
            `linear-gradient(to right, var(--primary) ${progress}%, var(--sub-text) ${progress}%)`
        );
    }

    updateInfo() {
        const currentTrack = this.currentTrack;
        const elementsToUpdate = {
            "#controller-title": currentTrack?.title || "",
            "#controller-description": currentTrack?.author || "",
            "#now-playing-title": currentTrack?.title || "",
            "#now-playing-description": currentTrack?.author || "",
            "#end-time": currentTrack
                ? currentTrack?.isStream
                    ? "∞"
                    : msToReadableTime(currentTrack.length)
                : "00:00",
            "#play-pause-btn":
                this.isPaused || !currentTrack ? "play_circle" : "pause_circle",
            "#repeat-btn": this.repeat == "track" ? "repeat_one" : "repeat",
        };

        Object.keys(elementsToUpdate).forEach((selector) => {
            const $element = $(selector);
            const newValue = elementsToUpdate[selector];
            if ($element.text() !== newValue) {
                $element.text(newValue);
            }
        });

        $("#autoplay-btn").toggleClass("active", this.autoplay)

        if (this.isPaused || !currentTrack) {
            this.timer.stop();
            this.updateTime();
        } else {
            this.timer.start();
        }

        $("#control-info").css("opacity", currentTrack ? "1" : "0");
        this.repeat == "off"
            ? $("#repeat-btn").removeClass("active")
            : $("#repeat-btn").addClass("active");
    }

    updateImage(selector, artworkUrl) {
        if (artworkUrl) {
            $(selector).fadeIn(200, function () {
                $(this).attr("src", artworkUrl);
            });
        } else {
            $(selector).fadeOut(200, function () {
                $(this).removeAttr("src");
            });
        }
    }

    updateChannelMemberView() {
        const channelMemberView = $("#channel-members");
        const usersList = Object.values(this.users).filter(
            (user) => user.userId !== this.userId
        );

        channelMemberView.empty();

        usersList.slice(0, 4).forEach((user) => {
            channelMemberView.append(`
                <div class="avatar">
                    <p class="name">${user.name}</p>
                    <img src="${user.avatarUrl}" alt="${user.name}">
                </div>
            `);
        });

        if (usersList.length > 4) {
            const extraCount = usersList.length - 4;
            channelMemberView.append(`
                <div class="avatar extra">
                    <p class="name">+${extraCount} more ...</p>
                    <p>+${extraCount}</p>
                </div>
            `);
        }
    }
}
