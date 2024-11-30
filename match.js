const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');

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

        // 读取文件夹中的所有文件
        const files = await fs.readdir(sourceDir);
        localVideos[source.name] = files
            .map(extractInfoFromFilename) // 提取文件名中的信息
            .filter(info => info); // 过滤解析失败的文件
    }

    return localVideos;
}

// 获取需要下载的视频信息
async function getRemoteVideos(source, globalSettings) {
    const options = [
        ...globalSettings['yt-dlp']?.options || [],
        ...source.custom_settings?.['yt-dlp']?.options || [],
        '--print', '%(id)s\t%(title)s'
    ];
    const command = ['yt-dlp', source.url, ...options];

    return new Promise((resolve, reject) => {
        console.log(`Fetching remote videos for: ${source.name}`);
        const process = execFile(command[0], command.slice(1), (error, stdout, stderr) => {
            if (error) return reject(stderr);

            const remoteVideos = stdout.split('\n').filter(Boolean).map(line => {
                const [id, title] = line.split('\t');
                return { id, title };
            });
            resolve(remoteVideos);
        });

        process.stderr.on('data', data => console.error(data));
    });
}

// 主函数
async function main() {
    const { global_settings: globalSettings, sources } = config;

    try {
        // 获取本地已下载的视频信息
        const localVideos = await getLocalVideos(globalSettings, sources);

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

            // 打印结果
            console.log('Videos to download:');
            videosToDownload.forEach(video => {
                console.log(`- ID: ${video.id}, Title: ${video.title}`);
            });
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(err => console.error(`Critical Error: ${err}`));
