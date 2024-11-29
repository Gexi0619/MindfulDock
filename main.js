const fs = require('fs-extra');
const { exec } = require('child_process');
const yaml = require('yaml');

// 加载 YAML 配置文件
function loadConfig(configPath) {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(fileContent);
}

// 下载逻辑
function downloadContent(source, globalSettings) {
    return new Promise((resolve, reject) => {
        const sourceType = source.type;
        const url = source.url;
        const outputDir = globalSettings.output_dir || './downloads';

        // 合并全局设置和自定义设置
        const globalOptions = globalSettings[sourceType]?.options || [];
        const customOptions = source.custom_settings?.[sourceType]?.options || [];
        const options = [...globalOptions, ...customOptions];

        // 确保输出目录存在
        const sourceOutputDir = `${outputDir}/${source.name}`;
        fs.ensureDirSync(sourceOutputDir);

        // 修正 --output 参数，使用双引号包裹
        const outputPath = `${sourceOutputDir}/%(upload_date)s - %(title)s - %(id)s.%(ext)s`;
        options.push("--output", `"${outputPath}"`);

        // 构造命令
        const safeOptions = options.map(opt =>
            opt.includes(' ') && !opt.startsWith('"') ? `"${opt}"` : opt // 包裹空格参数
        );
        const command = `yt-dlp ${url} ${safeOptions.join(' ')}`;
        console.log(`Running command: ${command}`);

        // 执行命令
        const process = exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error downloading ${source.name}:`, stderr);
                return reject(error);
            }
            console.log(`Downloaded ${source.name} successfully:\n`, stdout);
            resolve(stdout);
        });

        // 实时输出日志
        process.stdout.on('data', (data) => console.log(data));
        process.stderr.on('data', (data) => console.error(data));
    });
}



// 主函数
async function main() {
    try {
        const config = loadConfig('./config.yaml');
        const globalSettings = config.global_settings || {};
        const sources = config.sources || [];

        for (const source of sources) {
            try {
                await downloadContent(source, globalSettings);
            } catch (error) {
                console.error(`Failed to download ${source.name}:`, error.message);
            }
        }

        console.log('All downloads completed.');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
