const fs = require('fs-extra');
const path = require('path');

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

// 读取保存目录中的文件
async function readDownloadedVideos(globalSettings, sources) {
    const outputDir = globalSettings.output_dir || './downloads';
    const downloadedVideos = {};

    for (const source of sources) {
        const sourceDir = path.join(outputDir, source.name);
        if (!fs.existsSync(sourceDir)) {
            console.log(`Directory not found: ${sourceDir}`);
            continue;
        }

        // 读取文件夹中的所有文件
        const files = await fs.readdir(sourceDir);
        downloadedVideos[source.name] = files
            .map(extractInfoFromFilename) // 提取文件名中的信息
            .filter(info => info); // 过滤解析失败的文件
    }

    return downloadedVideos;
}

// 主函数
async function main() {
    const { global_settings: globalSettings, sources } = config;

    try {
        const downloadedVideos = await readDownloadedVideos(globalSettings, sources);

        // 展示已下载的视频信息
        for (const [sourceName, videos] of Object.entries(downloadedVideos)) {
            console.log(`\nSource: ${sourceName}`);
            videos.forEach(video => {
                console.log(`- Title: ${video.title}`);
                console.log(`  ID: ${video.id}`);
                console.log(`  Upload Date: ${video.upload_date}`);
            });
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch((err) => console.error(`Critical Error: ${err}`));
