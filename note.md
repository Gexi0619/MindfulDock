我根保存地址在/home/sungexiplay/test

我的yt-dlp的全局设置是 (URL格式是https://www.youtube.com/@jvscholz)
yt-dlp URL \
--write-sub --write-auto-sub --sub-lang "en" \
-f "bestvideo[height=720]+bestaudio[abr<=64]" \
--merge-output-format mp4 \
--match-filter '!is_live' \
--playlist-start 1 --playlist-end 2 \
--output "%(upload_date)s - %(title)s - %(id)s.%(ext)s"
默认下载到在根保存地址下，以youtube频道命名的文件夹内


我要下载的yt主页有@MiAnZhuiZong，和@jvscholz

@MiAnZhuiZong的单独下载设置是
yt-dlp URL \
-f "bestvideo[height=720]+bestaudio[abr<=64]" \
--merge-output-format mp4 \
--match-filter "!is_live" \
--playlist-start 1 --playlist-end 2 \
--output "%(upload_date)s - %(title)s - %(id)s.%(ext)s"