const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadMediaMessage,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const termuxPrefix = process.env.PREFIX || '/data/data/com.termux/files/usr';
const termuxBinDir = path.join(termuxPrefix, 'bin');
const homeDir = process.env.HOME || '';

const ffmpegCandidates = [
    path.join(termuxBinDir, 'ffmpeg'),
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg'
];
const ffmpegPath = ffmpegCandidates.find((p) => fs.existsSync(p)) || 'ffmpeg';

const ytDlpCandidates = [
    path.join(termuxBinDir, 'yt-dlp'),
    homeDir ? path.join(homeDir, '.local', 'bin', 'yt-dlp') : '',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp'
];
const ytDlpPath = ytDlpCandidates.find((p) => p && fs.existsSync(p)) || 'yt-dlp';

const tempDir = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

for (const file of fs.readdirSync(tempDir)) {
    try {
        fs.unlinkSync(path.join(tempDir, file));
    } catch {}
}

const pendingYoutubeChoices = new Map();
const CHOICE_TIMEOUT_MS = 2 * 60 * 1000;
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function safeUnlink(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch {}
    }
}

function isSafePublicUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;

        const hostname = parsed.hostname.toLowerCase();
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
        ) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

function getCleanHostname(rawUrl) {
    try {
        return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

function isYoutubeUrl(rawUrl) {
    const h = getCleanHostname(rawUrl);
    return h === 'youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com' || h === 'youtu.be';
}

function isInstagramUrl(rawUrl) {
    const h = getCleanHostname(rawUrl);
    return h === 'instagram.com' || h === 'instagr.am';
}

function isTikTokUrl(rawUrl) {
    const h = getCleanHostname(rawUrl);
    return h === 'tiktok.com' || h.endsWith('.tiktok.com');
}

function isTwitterUrl(rawUrl) {
    const h = getCleanHostname(rawUrl);
    return h === 'x.com' || h === 'twitter.com' || h === 'mobile.twitter.com' || h === 't.co';
}

function isThreadsUrl(rawUrl) {
    const h = getCleanHostname(rawUrl);
    return h === 'threads.net' || h === 'threads.com';
}

function convertToStickerWebp(inputPath, isVideo = false) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(
            tempDir,
            `sticker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.webp`
        );

        const args = isVideo
            ? [
                '-y',
                '-i', inputPath,
                '-t', '6',
                '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                '-vcodec', 'libwebp',
                '-loop', '0',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                '-q:v', '60',
                outputPath
            ]
            : [
                '-y',
                '-i', inputPath,
                '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                '-vcodec', 'libwebp',
                '-lossless', '0',
                '-q:v', '75',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                outputPath
            ];

        execFile(ffmpegPath, args, { timeout: 60000 }, (err, stdout, stderr) => {
            if (!err && fs.existsSync(outputPath)) {
                resolve(outputPath);
            } else {
                reject(new Error(stderr || (err ? err.message : 'Gagal membuat stiker.')));
            }
        });
    });
}

function ensureWhatsAppCompatibleVideo(inputPath) {
    return new Promise((resolve) => {
        execFile(ffmpegPath, ['-i', inputPath], (err, stdout, stderr) => {
            const info = (stderr || '') + (stdout || '');
            const isH264 = /Video:\s*h264/i.test(info);
            const isYuv420p = /yuv420p/i.test(info);
            const isMp4Ext = inputPath.toLowerCase().endsWith('.mp4');

            if (isH264 && isYuv420p && isMp4Ext) {
                return resolve(inputPath);
            }

            console.log('[FFmpeg] Mengonversi video ke H.264 agar bisa diputar di WhatsApp...');
            const outputPath = path.join(
                tempDir,
                `wa_h264_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`
            );

            const args = [
                '-y',
                '-i', inputPath,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '26',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                outputPath
            ];

            execFile(ffmpegPath, args, { timeout: 120000 }, (convErr) => {
                if (!convErr && fs.existsSync(outputPath)) {
                    safeUnlink(inputPath);
                    resolve(outputPath);
                } else {
                    resolve(inputPath);
                }
            });
        });
    });
}

async function downloadUrlToTempFile(mediaUrl, referer = '', defaultExt = 'mp4') {
    const headers = { 'User-Agent': USER_AGENT, 'Accept': '*/*' };
    if (referer) headers['Referer'] = referer;

    const res = await fetch(mediaUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(45000),
        headers
    });

    if (!res.ok) {
        throw new Error(`Gagal mengunduh media (${res.status})`);
    }

    const filePath = path.join(
        tempDir,
        `stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${defaultExt}`
    );
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

async function sendVideoFromDisk(sock, jid, quotedMsg, rawFilePath) {
    let finalPath = rawFilePath;
    try {
        finalPath = await ensureWhatsAppCompatibleVideo(rawFilePath);
        const fileSizeMB = fs.statSync(finalPath).size / (1024 * 1024);

        if (fileSizeMB > 60) {
            await sock.sendMessage(
                jid,
                {
                    document: fs.readFileSync(finalPath),
                    mimetype: 'video/mp4',
                    fileName: path.basename(finalPath)
                },
                { quoted: quotedMsg }
            );
        } else {
            await sock.sendMessage(
                jid,
                {
                    video: fs.readFileSync(finalPath),
                    mimetype: 'video/mp4'
                },
                { quoted: quotedMsg }
            );
        }
    } finally {
        safeUnlink(rawFilePath);
        if (finalPath !== rawFilePath) safeUnlink(finalPath);
    }
}

async function sendImageFromUrl(sock, jid, quotedMsg, imageUrl, referer, makeSticker = false) {
    const tempImg = await downloadUrlToTempFile(imageUrl, referer, 'jpg');
    let webpPath = null;
    try {
        if (makeSticker) {
            webpPath = await convertToStickerWebp(tempImg, false);
            await sock.sendMessage(jid, { sticker: fs.readFileSync(webpPath) }, { quoted: quotedMsg });
        } else {
            await sock.sendMessage(jid, { image: fs.readFileSync(tempImg) }, { quoted: quotedMsg });
        }
    } finally {
        safeUnlink(tempImg);
        safeUnlink(webpPath);
    }
}

async function sendExtractedMediaItems(sock, jid, quotedMsg, items, referer, makeSticker = false) {
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`Mengirim media ${i + 1}/${items.length} (${item.type})...`);
        if (item.type === 'video') {
            const tempVideo = await downloadUrlToTempFile(item.url, referer, 'mp4');
            await sendVideoFromDisk(sock, jid, quotedMsg, tempVideo);
        } else {
            await sendImageFromUrl(sock, jid, quotedMsg, item.url, referer, makeSticker);
        }
    }
}

function extractJsonStringLiteral(text, keyName) {
    const keyIdx = text.indexOf(`"${keyName}"`);
    if (keyIdx === -1) return null;
    const colonIdx = text.indexOf(':', keyIdx + keyName.length + 2);
    if (colonIdx === -1) return null;
    const startQuote = text.indexOf('"', colonIdx + 1);
    if (startQuote === -1) return null;

    let i = startQuote + 1;
    while (i < text.length) {
        const ch = text[i];
        if (ch === '\\') {
            i += 2;
            continue;
        }
        if (ch === '"') {
            return JSON.parse(text.slice(startQuote, i + 1));
        }
        i++;
    }
    return null;
}

function extractBalancedJsonObject(text, startSearchIdx) {
    const firstBrace = text.indexOf('{', startSearchIdx);
    if (firstBrace === -1) return null;
    let depth = 0;
    let inString = false;
    let i = firstBrace;
    while (i < text.length) {
        const ch = text[i];
        if (inString) {
            if (ch === '\\') {
                i += 2;
                continue;
            }
            if (ch === '"') inString = false;
        } else {
            if (ch === '"') inString = true;
            else if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) return text.slice(firstBrace, i + 1);
            }
        }
        i++;
    }
    return null;
}

function parseInstagramShortcodeMedia(media) {
    if (!media) return [];
    const results = [];

    const extractNode = (node) => {
        if (!node) return;
        const videoUrl =
            node.video_url ||
            (Array.isArray(node.video_versions) && node.video_versions[0]?.url) ||
            (Array.isArray(node.video_resources) && node.video_resources[0]?.src);

        if ((node.is_video || node.media_type === 2) && videoUrl) {
            results.push({ type: 'video', url: videoUrl });
            return;
        }

        const resources = node.display_resources;
        const highResImg =
            node.display_url ||
            (Array.isArray(resources) && resources.length > 0
                ? resources[resources.length - 1].src
                : null) ||
            (Array.isArray(node.image_versions2?.candidates) && node.image_versions2.candidates[0]?.url) ||
            node.thumbnail_src;

        if (highResImg) {
            results.push({ type: 'image', url: highResImg });
        }
    };

    const sidecarEdges = media.edge_sidecar_to_children?.edges;
    if (Array.isArray(sidecarEdges) && sidecarEdges.length > 0) {
        for (const edge of sidecarEdges) extractNode(edge?.node || edge);
    } else if (Array.isArray(media.carousel_media) && media.carousel_media.length > 0) {
        for (const item of media.carousel_media) extractNode(item);
    } else {
        extractNode(media);
    }

    return results;
}

function parseEmbedHtmlForMedia(html) {
    const addIdx = html.indexOf('__additionalDataLoaded');
    if (addIdx !== -1) {
        const jsonStr = extractBalancedJsonObject(html, addIdx);
        if (jsonStr) {
            try {
                const parsed = JSON.parse(jsonStr);
                const media = parsed?.shortcode_media || parsed?.gql_data?.shortcode_media || parsed;
                const items = parseInstagramShortcodeMedia(media);
                if (items.length > 0) return items;
            } catch {}
        }
    }

    try {
        const unescapedContext = extractJsonStringLiteral(html, 'contextJSON');
        if (unescapedContext) {
            const contextData = JSON.parse(unescapedContext);
            const shortcodeMedia =
                contextData?.gql_data?.shortcode_media ||
                contextData?.gql_data?.xdt_shortcode_media ||
                contextData?.shortcode_media;
            const items = parseInstagramShortcodeMedia(shortcodeMedia);
            if (items.length > 0) return items;
        }
    } catch {}

    return [];
}

async function extractInstagramMedia(rawUrl) {
    let targetUrl = rawUrl;
    if (/\/share\//i.test(rawUrl)) {
        try {
            const redirRes = await fetch(rawUrl, {
                redirect: 'follow',
                signal: AbortSignal.timeout(15000),
                headers: { 'User-Agent': USER_AGENT }
            });
            targetUrl = redirRes.url;
            if (redirRes.body) await redirRes.body.cancel();
        } catch {}
    }

    const match = targetUrl.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match) return [];
    const shortcode = match[1];

    try {
        const variables = JSON.stringify({
            shortcode,
            child_comment_count: 3,
            fetch_comment_count: 40,
            parent_comment_count: 24,
            has_threaded_comments: true
        });
        const gqlUrl = `https://www.instagram.com/graphql/query/?hl=en&query_hash=9f8827793ef34641b2fb195d4d41151c&variables=${encodeURIComponent(variables)}`;
        const gqlRes = await fetch(gqlUrl, {
            signal: AbortSignal.timeout(15000),
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': '*/*',
                'X-IG-App-ID': '936619743392459',
                'X-ASBD-ID': '198387',
                'X-IG-WWW-Claim': '0',
                'Origin': 'https://www.instagram.com',
                'Referer': `https://www.instagram.com/p/${shortcode}/`
            }
        });
        if (gqlRes.ok) {
            const json = await gqlRes.json();
            const media = json?.data?.shortcode_media || json?.data?.xdt_shortcode_media;
            const items = parseInstagramShortcodeMedia(media);
            if (items.length > 0) return items;
        }
    } catch {}

    for (const suffix of ['embed/', 'embed/captioned/']) {
        try {
            const res = await fetch(`https://www.instagram.com/p/${shortcode}/${suffix}`, {
                signal: AbortSignal.timeout(15000),
                headers: { 'User-Agent': USER_AGENT }
            });
            if (res.ok) {
                const items = parseEmbedHtmlForMedia(await res.text());
                if (items.length > 0) return items;
            }
        } catch {}
    }

    return [];
}

async function extractTikTokMedia(rawUrl) {
    try {
        const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(rawUrl)}&hd=1`, {
            signal: AbortSignal.timeout(20000),
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' }
        });
        if (res.ok) {
            const data = (await res.json())?.data;
            if (data) {
                if (Array.isArray(data.images) && data.images.length > 0) {
                    return data.images.map((url) => ({ type: 'image', url }));
                }
                const videoUrl = data.play || data.hdplay || data.wmplay;
                if (videoUrl) {
                    return [{
                        type: 'video',
                        url: videoUrl.startsWith('http') ? videoUrl : `https://www.tikwm.com${videoUrl}`
                    }];
                }
            }
        }
    } catch {}
    return [];
}

async function extractTwitterMedia(rawUrl) {
    let targetUrl = rawUrl;
    if (getCleanHostname(rawUrl) === 't.co') {
        try {
            const redir = await fetch(rawUrl, {
                redirect: 'follow',
                signal: AbortSignal.timeout(15000),
                headers: { 'User-Agent': USER_AGENT }
            });
            targetUrl = redir.url;
            if (redir.body) await redir.body.cancel();
        } catch {}
    }

    const match = targetUrl.match(/(?:twitter\.com|x\.com)\/(?:[^/]+)\/status\/(\d+)/i);
    if (!match) return [];
    const statusId = match[1];

    try {
        const res = await fetch(`https://api.fxtwitter.com/status/${statusId}`, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': USER_AGENT }
        });
        if (res.ok) {
            const allMedia = (await res.json())?.tweet?.media?.all;
            if (Array.isArray(allMedia) && allMedia.length > 0) {
                return allMedia.map((m) => ({
                    type: m.type === 'video' || m.type === 'gif' ? 'video' : 'image',
                    url: m.url
                }));
            }
        }
    } catch {}

    try {
        const res = await fetch(`https://api.vxtwitter.com/Twitter/status/${statusId}`, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': USER_AGENT }
        });
        if (res.ok) {
            const extMedia = (await res.json())?.media_extended;
            if (Array.isArray(extMedia) && extMedia.length > 0) {
                return extMedia.map((m) => ({
                    type: m.type === 'video' || m.type === 'gif' ? 'video' : 'image',
                    url: m.url
                }));
            }
        }
    } catch {}

    return [];
}

async function extractThreadsMedia(rawUrl) {
    const match = rawUrl.match(/threads\.(?:net|com)\/(?:@[^/]+\/post|t)\/([A-Za-z0-9_-]+)/i);
    if (!match) return [];
    try {
        const res = await fetch(`https://www.threads.net/@_/post/${match[1]}/embed/`, {
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': USER_AGENT }
        });
        if (res.ok) {
            const html = await res.text();
            const items = [];
            const seen = new Set();
            for (const m of html.matchAll(/<source[^>]+src=["']([^"']+)["']/gi)) {
                const vUrl = m[1].replace(/&amp;/g, '&');
                if (!seen.has(vUrl)) {
                    seen.add(vUrl);
                    items.push({ type: 'video', url: vUrl });
                }
            }
            for (const m of html.matchAll(/<img[^>]+class=["'][^"']*SingleInnerMedia[^"']*["'][^>]+src=["']([^"']+)["']/gi)) {
                const iUrl = m[1].replace(/&amp;/g, '&');
                if (!seen.has(iUrl)) {
                    seen.add(iUrl);
                    items.push({ type: 'image', url: iUrl });
                }
            }
            return items;
        }
    } catch {}
    return [];
}

async function inspectUrlSafe(url) {
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': USER_AGENT }
        });
        if (!res.ok || !isSafePublicUrl(res.url)) {
            if (res.body) await res.body.cancel();
            return { type: 'unknown', directUrl: url, ogImageUrl: null };
        }
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (contentType.startsWith('image/')) {
            if (res.body) await res.body.cancel();
            return { type: 'image', directUrl: res.url };
        }
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
            if (res.body) await res.body.cancel();
            return { type: 'direct_file', directUrl: res.url, contentType };
        }
        const html = await res.text();
        const ogMatch =
            html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
        let ogImageUrl = ogMatch ? ogMatch[1].replace(/&amp;/g, '&') : null;
        if (ogImageUrl && ogImageUrl.startsWith('/')) {
            ogImageUrl = new URL(ogImageUrl, res.url).href;
        }
        return { type: 'webpage', directUrl: res.url, ogImageUrl };
    } catch {
        return { type: 'unknown', directUrl: url, ogImageUrl: null };
    }
}

function runYtDlpProcess(url, mode, allowPlaylist, extraArgs = []) {
    return new Promise((resolve, reject) => {
        const fileId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const outputTemplate = path.join(tempDir, `${fileId}_%(autonumber)s.%(ext)s`);

        const videoFormat =
            'bestvideo[vcodec^=avc1][height<=720]+bestaudio[ext=m4a]/' +
            'best[vcodec^=avc1][ext=mp4][height<=720]/' +
            'best[ext=mp4][filesize<95M]/' +
            'bestvideo[height<=720]+bestaudio/best';

        const commonFlags = [
            '--ffmpeg-location', ffmpegPath,
            allowPlaylist ? '--yes-playlist' : '--no-playlist',
            '--max-filesize', '100M',
            ...extraArgs,
            '-o', outputTemplate,
            url
        ];

        const args = mode === 'audio'
            ? ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0', ...commonFlags]
            : ['-f', videoFormat, '-S', 'vcodec:h264,res:720,acodec:m4a', '--merge-output-format', 'mp4', ...commonFlags];

        execFile(ytDlpPath, args, { maxBuffer: 1024 * 1024 * 100, timeout: 150000 }, (error, stdout, stderr) => {
            const downloadedFiles = fs
                .readdirSync(tempDir)
                .filter((file) => file.startsWith(fileId))
                .sort()
                .map((file) => path.join(tempDir, file));

            if (downloadedFiles.length === 0) {
                return reject(new Error(stderr || (error ? error.message : 'Unduhan gagal.')));
            }
            resolve(downloadedFiles);
        });
    });
}

async function downloadAndSendViaYtDlp(sock, jid, quotedMsg, url, mode = 'video', allowPlaylist = true) {
    let filePaths;
    try {
        filePaths = await runYtDlpProcess(url, mode, allowPlaylist);
    } catch (firstErr) {
        if (isYoutubeUrl(url)) {
            filePaths = await runYtDlpProcess(url, mode, allowPlaylist, [
                '--extractor-args', 'youtube:player_client=android_vr,tv,mweb'
            ]);
        } else {
            throw firstErr;
        }
    }

    try {
        for (const filePath of filePaths) {
            if (mode === 'audio') {
                await sock.sendMessage(
                    jid,
                    {
                        document: fs.readFileSync(filePath),
                        mimetype: 'audio/mpeg',
                        fileName: `audio_${Date.now()}.mp3`
                    },
                    { quoted: quotedMsg }
                );
                safeUnlink(filePath);
            } else {
                await sendVideoFromDisk(sock, jid, quotedMsg, filePath);
            }
        }
    } finally {
        for (const filePath of filePaths) safeUnlink(filePath);
    }
}

function setYoutubeSession(jid, url) {
    const existing = pendingYoutubeChoices.get(jid);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => pendingYoutubeChoices.delete(jid), CHOICE_TIMEOUT_MS);
    pendingYoutubeChoices.set(jid, { url, timer });
}

function clearYoutubeSession(jid) {
    const existing = pendingYoutubeChoices.get(jid);
    if (existing) {
        clearTimeout(existing.timer);
        pendingYoutubeChoices.delete(jid);
    }
}

function unwrapMessage(rawMessage) {
    if (!rawMessage) return null;
    let m = rawMessage;
    if (m.ephemeralMessage) m = m.ephemeralMessage.message;
    if (m.viewOnceMessage) m = m.viewOnceMessage.message;
    if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message;
    return m;
}

function extractText(m) {
    if (!m) return '';
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        ''
    ).trim();
}

async function reactMsg(sock, msg, emoji) {
    try {
        await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } });
    } catch {}
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['Bot WA Termux', 'Chrome', '1.0.0'],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    const pairingPhone = (process.env.PHONE || '').replace(/[^0-9]/g, '');
    if (pairingPhone && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(pairingPhone);
                console.log(`\n========================================`);
                console.log(`  KODE PAIRING WA: ${code}`);
                console.log(`  Buka WA > Perangkat Tertaut > Tautkan dengan nomor telepon`);
                console.log(`========================================\n`);
            } catch (err) {
                console.error('[Bot WA] Gagal meminta kode pairing:', err.message);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !pairingPhone) {
            console.log('\nScan QR Code ini di WhatsApp (Perangkat Tertaut):');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[Bot WA] Koneksi terputus (kode: ${statusCode}).`);
            if (shouldReconnect) {
                console.log('[Bot WA] Menyambung ulang dalam 3 detik...');
                setTimeout(startBot, 3000);
            } else {
                console.log('[Bot WA] Akun logout. Hapus folder auth_info lalu jalankan ulang.');
                process.exit(1);
            }
        } else if (connection === 'open') {
            console.log('\n[Bot WA] AKTIF! Siap download (IG, TikTok, FB, X, Threads, YouTube) & buat stiker.\n');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const jid = msg.key.remoteJid;
            if (!jid || jid === 'status@broadcast') continue;

            const content = unwrapMessage(msg.message);
            if (!content) continue;

            const text = extractText(content);

            try {
                // 1. Cek balasan pilihan YouTube
                if (pendingYoutubeChoices.has(jid)) {
                    const normalized = text.toLowerCase();
                    if (normalized === 'batal' || normalized === 'cancel' || normalized === '0') {
                        clearYoutubeSession(jid);
                        await sock.sendMessage(jid, { text: 'Unduhan YouTube dibatalkan.' }, { quoted: msg });
                        continue;
                    }

                    const isVideoChoice = normalized === '1' || normalized === 'video';
                    const isMusicChoice = ['2', 'music', 'musik', 'mp3', 'audio'].includes(normalized);

                    if (isVideoChoice || isMusicChoice) {
                        const session = pendingYoutubeChoices.get(jid);
                        clearYoutubeSession(jid);
                        await reactMsg(sock, msg, '⏳');
                        await downloadAndSendViaYtDlp(sock, jid, msg, session.url, isMusicChoice ? 'audio' : 'video', false);
                        await reactMsg(sock, msg, '✅');
                        continue;
                    }
                }

                // 2. Cek kirim gambar / video langsung -> ubah jadi stiker
                const isImageMsg = Boolean(content.imageMessage);
                const isVideoMsg = Boolean(content.videoMessage);
                if (isImageMsg || isVideoMsg) {
                    await reactMsg(sock, msg, '⏳');
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const ext = isVideoMsg ? 'mp4' : 'jpg';
                    const rawPath = path.join(tempDir, `in_${Date.now()}.${ext}`);
                    let webpPath = null;
                    try {
                        fs.writeFileSync(rawPath, buffer);
                        webpPath = await convertToStickerWebp(rawPath, isVideoMsg);
                        await sock.sendMessage(jid, { sticker: fs.readFileSync(webpPath) }, { quoted: msg });
                        await reactMsg(sock, msg, '✅');
                    } finally {
                        safeUnlink(rawPath);
                        safeUnlink(webpPath);
                    }
                    continue;
                }

                // 3. Cek link media sosial / YouTube
                const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
                if (!urlMatch) continue;

                const url = urlMatch[0];
                if (!isSafePublicUrl(url)) throw new Error('URL tidak valid.');

                if (isYoutubeUrl(url)) {
                    setYoutubeSession(jid, url);
                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                'Link YouTube terdeteksi. Balas pesan ini dengan:\n\n' +
                                '*1* atau *video* (Unduh Video MP4)\n' +
                                '*2* atau *music* (Unduh Audio MP3)\n\n' +
                                '_(Ketik *0* untuk batal, berlaku 2 menit)_'
                        },
                        { quoted: msg }
                    );
                    continue;
                }

                const makeSticker = /\bstiker\b/i.test(text);
                console.log(`[Bot WA] Memproses link dari ${jid}: ${url}`);
                await reactMsg(sock, msg, '⏳');

                if (isInstagramUrl(url)) {
                    const igItems = await extractInstagramMedia(url);
                    if (igItems.length > 0) {
                        await sendExtractedMediaItems(sock, jid, msg, igItems, 'https://www.instagram.com/', makeSticker);
                        await reactMsg(sock, msg, '✅');
                        continue;
                    }
                }

                if (isTikTokUrl(url)) {
                    const ttItems = await extractTikTokMedia(url);
                    if (ttItems.length > 0) {
                        await sendExtractedMediaItems(sock, jid, msg, ttItems, 'https://www.tiktok.com/', makeSticker);
                        await reactMsg(sock, msg, '✅');
                        continue;
                    }
                }

                if (isTwitterUrl(url)) {
                    const xItems = await extractTwitterMedia(url);
                    if (xItems.length > 0) {
                        await sendExtractedMediaItems(sock, jid, msg, xItems, 'https://x.com/', makeSticker);
                        await reactMsg(sock, msg, '✅');
                        continue;
                    }
                }

                if (isThreadsUrl(url)) {
                    const threadsItems = await extractThreadsMedia(url);
                    if (threadsItems.length > 0) {
                        await sendExtractedMediaItems(sock, jid, msg, threadsItems, 'https://www.threads.net/', makeSticker);
                        await reactMsg(sock, msg, '✅');
                        continue;
                    }
                }

                // Fallback umum (Facebook, TikTok/IG/X fallback, link langsung, dll.)
                const info = await inspectUrlSafe(url);
                if (info.type === 'image') {
                    await sendImageFromUrl(sock, jid, msg, info.directUrl, url, makeSticker);
                    await reactMsg(sock, msg, '✅');
                    continue;
                }

                try {
                    await downloadAndSendViaYtDlp(sock, jid, msg, info.directUrl || url, 'video', true);
                    await reactMsg(sock, msg, '✅');
                } catch (ytErr) {
                    if (info.ogImageUrl) {
                        await sendImageFromUrl(sock, jid, msg, info.ogImageUrl, url, makeSticker);
                        await reactMsg(sock, msg, '✅');
                    } else {
                        throw ytErr;
                    }
                }
            } catch (error) {
                console.error('[Bot WA] Error:', error.message || error);
                await reactMsg(sock, msg, '❌');
                await sock.sendMessage(
                    jid,
                    { text: 'Gagal mengunduh media. Pastikan link publik dan valid.' },
                    { quoted: msg }
                );
            }
        }
    });
}

process.on('uncaughtException', (err) => console.error('[Bot WA] Uncaught:', err.message));
process.on('unhandledRejection', (err) => console.error('[Bot WA] Rejection:', err?.message || err));

startBot();
