const fs = require('fs');
const path = require('path');
const { YtDlp } = require('ytdlp-nodejs');
const sanitize = require('sanitize-filename');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cheerio = require('cheerio');

const ytdlp = new YtDlp();

async function getFirstYouTubeVideoUrl(query) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const res = await fetch(searchUrl);
  const html = await res.text();
  const $ = cheerio.load(html);
  const videoId = html.match(/"videoId":"(.*?)"/)?.[1];
  // Debug logging can be added here if needed
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

async function downloadSong(title, artist, outputDir) {
  const safeName = sanitize(`${title} - ${artist}`);
  const filePath = path.join(outputDir, `${safeName}.mp3`);

  if (fs.existsSync(filePath)) return filePath;

  const searchQuery = `${title} ${artist} lyrics`;
  const videoUrl = await getFirstYouTubeVideoUrl(searchQuery);

  if (!videoUrl) throw new Error('No video found for search query');
  const output = await ytdlp.downloadAsync(videoUrl, {
    output: filePath,
    format: 'bestaudio/best',
  });

  // Debug logging can be added here if needed

  return filePath;
}

module.exports = { downloadSong, getFirstYouTubeVideoUrl }; 