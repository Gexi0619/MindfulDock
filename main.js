const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

// 加载 JSON 配置
const config = require('./config.json');

// 提取文件名中的 title 和 id
function extractInfoFromFilename(filename) {
    const regex = /^(?<upload_date>\d{8}) - (?<title>.+?) - (?<id>.+?)\..+$/;
    const match = filename.match(regex);
    if (match && match.groups) {
        return {
            title: match.groups.title,
            id: match.groups.id,
            upload_date: match.groups.upload_date
        };
    }
    return null;
}

// 获取本地已下载的视频信息
async function getLocalVideos(globalSettings, sources) {
    const outputDir = globalSettings.output_dir || './downloads';
    const localVideos = {};

    for (const source of sources) {
        const sourceDir = path.join(outputDir, source.name);
        if (!fs.existsSync(sourceDir)) {
            console.log(`Directory not found: ${sourceDir}`);
            continue;
        }

        const files = await fs.readdir(sourceDir);
        localVideos[source.name] = files
            .map(extractInfoFromFilename)
            .filter(info => info); // 过滤解析失败的文件
    }

    return localVideos;
}

// 获取远程所有视频信息，包括日期和时长
async function getRemoteVideos(source, globalSettings) {
    const options = [
        ...globalSettings['yt-dlp']?.options || [],
        ...source.custom_settings?.['yt-dlp']?.options || [],
        '--print', '%(id)s\t%(title)s\t%(upload_date)s\t%(duration_string)s'
    ];
    const command = ['yt-dlp', source.url, ...options];

    return new Promise((resolve, reject) => {
        console.log(`Fetching remote videos for: ${source.name}`);
        const process = spawn(command[0], command.slice(1));

        let stdout = '';
        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            console.error(data.toString());
        });

        process.on('close', (code) => {
            if (code !== 0) {
                reject(`Command failed with exit code ${code}`);
            } else {
                const remoteVideos = stdout.split('\n').filter(Boolean).map(line => {
                    const [id, title, upload_date, duration] = line.split('\t');
                    return { id, title, upload_date, duration };
                });
                resolve(remoteVideos);
            }
        });
    });
}

// 构造下载命令
function buildDownloadCommand(source, globalSettings, videoId) {
    const outputDir = source.custom_settings?.output_dir || globalSettings.output_dir || './downloads';
    const options = [
        ...globalSettings['yt-dlp']?.options || [],
        ...source.custom_settings?.['yt-dlp']?.options || [],
        '--output', `${outputDir}/${source.name}/%(upload_date)s - %(title)s - %(id)s.%(ext)s`,
        '--match-filter', `id=${videoId}`
    ];
    return ['yt-dlp', source.url, ...options];
}

// 执行下载命令并展示实时输出
async function downloadVideo(command) {
    return new Promise((resolve, reject) => {
        console.log(`Running download command: ${command.join(' ')}`);
        const process = spawn(command[0], command.slice(1), { stdio: 'inherit' });

        process.on('close', (code) => {
            if (code !== 0) {
                reject(`Download failed with exit code ${code}`);
            } else {
                resolve();
            }
        });
    });
}

// 打印指定的视频列表
function printVideos(title, videos, showDuration = false) {
    console.log(`\n${title}:`);
    videos.forEach(video => {
        const date = video.upload_date || 'Unknown Date';
        const duration = showDuration ? `, Duration: ${video.duration || 'Unknown'}` : '';
        console.log(`- ID: ${video.id}, Title: ${video.title}, Date: ${date}${duration}`);
    });
}

// 主函数
async function main() {
    const { global_settings: globalSettings, sources } = config;

    try {
        // 获取本地已下载的视频信息
        const localVideos = await getLocalVideos(globalSettings, sources);

        // 用于存储所有需要下载的视频
        const videosToDownloadBySource = {};

        // 第一阶段：分析所有频道的 `to-download` 列表
        for (const source of sources) {
            console.log(`\nProcessing source: ${source.name}`);

            // 获取远程需要下载的视频信息
            const remoteVideos = await getRemoteVideos(source, globalSettings);

            // 提取本地视频 ID 集合
            const localVideoIds = new Set(
                (localVideos[source.name] || []).map(video => video.id)
            );

            // 筛选真正需要下载的视频
            const videosToDownload = remoteVideos.filter(video => !localVideoIds.has(video.id));
            videosToDownloadBySource[source.name] = videosToDownload;

            // 打印 `remote` 和 `to-download` 列表
            printVideos(`Remote Videos for ${source.name}`, remoteVideos);
            printVideos(`Videos to Download for ${source.name}`, videosToDownload, true);
        }

        // 第二阶段：统一下载所有 `to-download` 的视频
        for (const source of sources) {
            const videosToDownload = videosToDownloadBySource[source.name] || [];
            for (const video of videosToDownload) {
                const command = buildDownloadCommand(source, globalSettings, video.id);
                await downloadVideo(command);
                console.log(`Downloaded: ${video.title} (ID: ${video.id})`);
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(err => console.error(`Critical Error: ${err}`));
