const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const chalk = require('chalk');


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
        '--id', videoId // 指定要下载的视频 ID
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
                reject(`Download failed with exit code ${code}`);
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

function printStatistics(title, stats) {
    console.log(`\n${chalk.blue.bold(title)}`);
    console.log(chalk.gray('───────────────────────────────────────────────'));
    console.log(`${chalk.green('✔')} Total local videos: ${chalk.yellow(stats.totalLocalVideos)}`);
    console.log(`${chalk.green('✔')} Total remote videos: ${chalk.yellow(stats.totalRemoteVideos)}`);
    console.log(`${chalk.green('✔')} Videos in both local and remote: ${chalk.yellow(stats.matchedVideosCount)}`);
    console.log(`${chalk.red('❌')} Videos only in local: ${chalk.yellow(stats.onlyLocalVideosCount)}`);
    console.log(`${chalk.green('→')} Videos to download: ${chalk.yellow(stats.toDownloadCount)}`);
}

function printVideos(title, videos) {
    console.log(`\n${chalk.magenta.bold(title)}`);
    if (videos.length === 0) {
        console.log(`  ${chalk.green('✔')} No videos to download.`);
        return;
    }
    console.log(chalk.gray('───────────────────────────────────────────────'));
    videos.forEach((video, index) => {
        const date = video.upload_date || 'Unknown Date';
        console.log(`  ${chalk.yellow(`#${index + 1}`)} ID: ${chalk.cyan(video.id)} | Title: ${chalk.green(video.title)} | Date: ${chalk.blue(date)}`);
    });
}


// 主函数
async function main() {
    const { global_settings: globalSettings, sources } = config;

    try {
        // 获取本地已下载的视频信息
        const localVideos = await getLocalVideos(globalSettings, sources);

        for (const source of sources) {
            console.log(`\n${chalk.bold.underline(`Processing source: ${source.name}`)}`);

            // 获取远程需要下载的视频信息
            const remoteVideos = await getRemoteVideos(source, globalSettings);

            // 提取本地和远程的视频 ID
            const localVideoIds = new Set(
                (localVideos[source.name] || []).map(video => video.id)
            );
            const remoteVideoIds = new Set(remoteVideos.map(video => video.id));

            // 统计信息
            const stats = {
                totalLocalVideos: localVideoIds.size,
                totalRemoteVideos: remoteVideoIds.size,
                matchedVideosCount: Array.from(localVideoIds).filter(id => remoteVideoIds.has(id)).length,
                onlyLocalVideosCount: localVideoIds.size - Array.from(localVideoIds).filter(id => remoteVideoIds.has(id)).length,
                toDownloadCount: remoteVideos.filter(video => !localVideoIds.has(video.id)).length
            };

            // 筛选需要下载的视频
            const videosToDownload = remoteVideos.filter(video => !localVideoIds.has(video.id));

            // 打印统计信息和待下载视频
            printStatistics(`Statistics for ${source.name}`, stats);
            printVideos(`Videos to Download for ${source.name}`, videosToDownload);

            // 实际下载 `to-download` 视频
            if (videosToDownload.length > 0) {
                console.log(`\n${chalk.green('Starting downloads...')}`);
                for (const video of videosToDownload) {
                    const command = buildDownloadCommand(source, globalSettings, video.id);
                    try {
                        await downloadVideo(command);
                        console.log(`${chalk.green('✔')} Downloaded: ${chalk.cyan(video.title)} (ID: ${chalk.yellow(video.id)})`);
                    } catch (error) {
                        console.error(`${chalk.red('✖')} Failed to download: ${chalk.cyan(video.title)} (ID: ${chalk.yellow(video.id)})`);
                        console.error(error);
                    }
                }
            } else {
                console.log(`${chalk.blue('No videos to download for this source.')}`);
            }
        }
    } catch (error) {
        console.error(chalk.red('Error:'), error);
    }
}





main().catch(err => console.error(`Critical Error: ${err}`));
