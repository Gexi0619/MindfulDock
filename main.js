const fs = require('fs-extra');
const { execFile } = require('child_process');

// 加载 JSON 配置
const config = require('./config.json');

// 构造 yt-dlp 命令
function buildCommand(source, globalSettings) {
    const outputDir = globalSettings.output_dir || './downloads';
    const options = [
        ...globalSettings['yt-dlp']?.options || [],
        ...source.custom_settings?.['yt-dlp']?.options || [],
        '--output', `${outputDir}/${source.name}/%(upload_date)s - %(title)s - %(id)s.%(ext)s`
    ];
    return ['yt-dlp', source.url, ...options];
}

// 执行命令
function runCommand(command) {
    return new Promise((resolve, reject) => {
        console.log(`Running command: ${command.join(' ')}`);
        const process = execFile(command[0], command.slice(1), (error, stdout, stderr) => {
            if (error) return reject(stderr);
            console.log(stdout);
            resolve(stdout);
        });
        process.stdout.on('data', (data) => console.log(data));
        process.stderr.on('data', (data) => console.error(data));
    });
}

// 主函数
async function main() {
    const { global_settings: globalSettings, sources } = config;
    for (const source of sources) {
        try {
            const command = buildCommand(source, globalSettings);
            await runCommand(command);
            console.log(`Downloaded ${source.name} successfully.`);
        } catch (error) {
            console.error(`Failed to download ${source.name}: ${error}`);
        }
    }
    console.log('All downloads completed.');
}

main().catch((err) => console.error(`Critical Error: ${err}`));
