const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

// 加载 JSON 配置
const config = require('./config.json');

// 提取文件名中的 title 和 id
function extractInfoFromFilename(filename) {
    const regex = /^(?<upload_date>\d{8}) - (?<title>.+?) - (?<id>.{11})\.[^.]+$/;
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
        '--flat-playlist', '--print', '%(id)s\t%(title)s'
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
                    const [id, title] = line.split('\t');
                    return { id, title };
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
        '--', videoId // 指定要下载的视频 ID
    ];
    return ['yt-dlp', ...options];
}


// 执行下载命令并展示实时输出
async function downloadVideo(command) {
    return new Promise((resolve, reject) => {
        console.log(`Running download command: ${command.join(' ')}`);
        const process = spawn(command[0], command.slice(1), { stdio: 'inherit' });

        process.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Command failed with exit code ${code}`));
            } else {
                resolve();
            }
        });
    });
}


// 打印指定的视频列表
function printVideos(title, videos) {
    console.log(`\n${title}:`);
    if (videos.length === 0) {
        console.log('  (No videos to download)');
        return;
    }
    videos.forEach(video => {
        const date = video.upload_date || 'Unknown Date';
        console.log(`- ID: ${video.id}, Title: ${video.title}, Date: ${date}`);
    });
}




// 主函数
async function main() {
    const { global_settings: globalSettings, sources } = config;
    const args = process.argv.slice(2);
    const printOnly = args.includes('--print-only');

    const downloadErrors = []; // 用于存储下载错误

    try {
        // 获取本地已下载的视频信息
        const localVideos = await getLocalVideos(globalSettings, sources);

        // 用于存储所有需要下载的视频
        const videosToDownloadBySource = {};

        // 阶段 1：分析所有频道的统计信息
        for (const source of sources) {
            console.log(`\nProcessing source: ${source.name}`);

            // 获取远程需要下载的视频信息
            const remoteVideos = await getRemoteVideos(source, globalSettings);

            // 提取本地和远程的视频 ID
            const localVideoIds = new Set(
                (localVideos[source.name] || []).map(video => video.id)
            );
            const remoteVideoIds = new Set(remoteVideos.map(video => video.id));

            // 统计信息
            const totalLocalVideos = localVideoIds.size;
            const totalRemoteVideos = remoteVideoIds.size;
            const matchedVideosCount = Array.from(localVideoIds).filter(id => remoteVideoIds.has(id)).length;
            const onlyLocalVideosCount = totalLocalVideos - matchedVideosCount;

            // 筛选需要下载的视频
            const videosToDownload = remoteVideos.filter(video => !localVideoIds.has(video.id));
            videosToDownloadBySource[source.name] = videosToDownload;

            // 打印统计信息
            console.log(`Statistics for ${source.name}:`);
            console.log(`- Total local videos: ${totalLocalVideos}`);
            console.log(`- Total remote videos: ${totalRemoteVideos}`);
            console.log(`- Videos in both local and remote: ${matchedVideosCount}`);
            console.log(`- Videos only in local: ${onlyLocalVideosCount}`);
            console.log(`- Videos to download: ${videosToDownload.length}`);

            // 打印待下载的视频列表
            printVideos(`To-download Videos for ${source.name}`, videosToDownload);
        }

        // 阶段 2：下载 `to-download` 列表中的视频
        if (!printOnly) {
            for (const source of sources) {
                const videosToDownload = videosToDownloadBySource[source.name] || [];
                for (const video of videosToDownload) {
                    try {
                        const command = buildDownloadCommand(source, globalSettings, video.id);
                        await downloadVideo(command);
                        console.log(`Downloaded: ${video.title} (ID: ${video.id})`);
                    } catch (error) {
                        // 记录下载失败的视频及错误信息
                        downloadErrors.push({
                            source: source.name,
                            videoId: video.id,
                            title: video.title,
                            error: error.message,
                        });
                        console.error(`Failed to download: ${video.title} (ID: ${video.id})`);
                    }
                }
            }
        } else {
            console.log("\n--print-only specified. Skipping downloads.");
        }

        // 打印下载错误信息
        if (downloadErrors.length > 0) {
            console.log("\nDownload Errors:");
            downloadErrors.forEach(err => {
                console.log(
                    `- Source: ${err.source}, Video: ${err.title} (ID: ${err.videoId}), Error: ${err.error}`
                );
            });
        }
    } catch (error) {
        console.error('Error:', error);
    }
}





main().catch(err => console.error(`Critical Error: ${err}`));
