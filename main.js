// server.js
import express from "express";
import puppeteer from "puppeteer";

// --- Helper Function to Convert ArrayBuffer to Base64 (Node.js version) ---
function arrayBufferToBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

// --- List of Possible Background Image URLs ---
const backgroundUrls = [
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-1.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-10.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-11.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-12.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-13.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-14.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-15.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-16.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-2.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-3.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-4.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-5.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-6.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-7.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-8.jpg",
  "https://pub-f05b78f7221549728707593770f5daa7.r2.dev/Rectangle-9.jpg",
];

// --- Constants ---
const DEFAULT_VIEWPORT_WIDTH = 1400;
const DEFAULT_VIEWPORT_HEIGHT = 800;
const PADDING = 60; // Padding around the screenshot
const MAX_WIDTH = 4096; // Max final image width
const MAX_HEIGHT = 4096; // Max final image height
const PAGE_LOAD_TIMEOUT = 60000; // 60 seconds
const HTML_LOAD_TIMEOUT = 30000; // 30 seconds
const FINAL_IMAGE_WAIT_TIMEOUT = 5000; // Timeout for waiting for the final composite image

const app = express();
const port = 3000; // Or any port you prefer

// Helper function for delays (use sparingly)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Takes a screenshot of a URL, composites it with a background, and returns the image buffer.
 * @param {string} targetUrl The URL to screenshot.
 * @param {number} viewportWidth Initial viewport width for the target URL.
 * @param {number} viewportHeight Initial viewport height for the target URL.
 * @returns {Promise<Buffer>} A Promise resolving to the final JPEG image buffer.
 */
async function takeCompositedScreenshot(
  targetUrl,
  viewportWidth,
  viewportHeight
) {
  const randomIndex = Math.floor(Math.random() * backgroundUrls.length);
  const selectedBackgroundUrl = backgroundUrls[randomIndex];

  const validatedTargetUrl = targetUrl; // Already validated
  const validatedBgImageUrl = new URL(selectedBackgroundUrl).toString(); // Assume internal list is valid

  let browser = null;
  try {
    // --- 1. Fetch Background Image ---
    console.log(
      `[${validatedTargetUrl}] Fetching background: ${validatedBgImageUrl}`
    );
    let backgroundImageDataUri;
    try {
      const bgResponse = await fetch(validatedBgImageUrl);
      if (!bgResponse.ok) {
        throw new Error(
          `Failed background fetch (${validatedBgImageUrl}): ${bgResponse.status}`
        );
      }
      const contentType =
        bgResponse.headers.get("content-type") || "image/jpeg";
      const effectiveContentType = contentType.startsWith("image/")
        ? contentType
        : "image/jpeg";
      const imageBuffer = await bgResponse.arrayBuffer();
      backgroundImageDataUri = `data:${effectiveContentType};base64,${arrayBufferToBase64(
        imageBuffer
      )}`;
      console.log(`[${validatedTargetUrl}] Background fetched.`);
    } catch (bgError) {
      console.error(
        `[${validatedTargetUrl}] Error fetching background:`,
        bgError
      );
      throw new Error(`Background image fetch failed: ${bgError.message}`);
    }

    console.log(`[${validatedTargetUrl}] Launching browser...`);
    browser = await puppeteer.launch({
      headless: true, // Use 'new' for newer Puppeteer versions if preferred
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      ignoreDefaultArgs: ["--disable-extensions"],
    });
    const page = await browser.newPage();

    console.log(
      `[${validatedTargetUrl}] Setting initial viewport: ${viewportWidth}x${viewportHeight}`
    );
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
    });

    await page.evaluateOnNewDocument(() => {
      const css = `*,*::before,*::after{transition-property:none!important;transition-duration:0s!important;transition-delay:0s!important;animation-name:none!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important}::-webkit-scrollbar{display:none}body{-ms-overflow-style:none;scrollbar-width:none}`;
      const style = document.createElement("style");
      style.id = "disable-motion-style";
      style.append(document.createTextNode(css));
      document.documentElement.append(style);
    });

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      const requestUrl = interceptedRequest.url();
      if (requestUrl.includes("https://runtime.fine.dev/error-overlay.js")) {
        interceptedRequest.abort();
      } else {
        interceptedRequest.continue();
      }
    });

    console.log(`[${validatedTargetUrl}] Navigating to target...`);
    try {
      await page.goto(validatedTargetUrl, {
        waitUntil: "networkidle0",
        timeout: PAGE_LOAD_TIMEOUT,
      });
    } catch (gotoError) {
      console.warn(
        `[${validatedTargetUrl}] Navigation with networkidle0 failed (may be expected for SPAs): ${gotoError.message}. Trying load...`
      );
      try {
        await page.goto(validatedTargetUrl, {
          waitUntil: "load",
          timeout: PAGE_LOAD_TIMEOUT,
        });
      } catch (loadError) {
        console.error(
          `[${validatedTargetUrl}] Navigation failed completely: ${loadError.message}`
        );
        // Decide if you want to proceed or throw
        // Example: Try screenshotting error page vs throwing
        // throw new Error(`Navigation failed: ${loadError.message}`);
      }
    }
    console.log(`[${validatedTargetUrl}] Navigation attempt finished.`);

    // Optional settle delay - uncomment if needed
    // await delay(1000); // e.g., 1 second

    console.log(`[${validatedTargetUrl}] Taking initial screenshot...`);
    const screenshotBase64 = await page.screenshot({
      encoding: "base64",
      type: "jpeg",
      quality: 95,
    });
    console.log(`[${validatedTargetUrl}] Initial screenshot taken.`);

    // --- 3. Prepare HTML ---
    const screenshotDataUri = `data:image/jpeg;base64,${screenshotBase64}`;

    // Dimension calculations
    const screenshotWidth = viewportWidth;
    const screenshotHeight = viewportHeight;
    const finalWidth = screenshotWidth + PADDING * 2;
    const finalHeight = screenshotHeight + PADDING * 2;

    let cappedWidth = finalWidth;
    let cappedHeight = finalHeight;
    let effectiveScreenshotWidth = screenshotWidth;
    let effectiveScreenshotHeight = screenshotHeight;

    // Scaling logic
    if (cappedWidth > MAX_WIDTH) {
      const scaleFactor = MAX_WIDTH / cappedWidth;
      cappedWidth = MAX_WIDTH;
      cappedHeight = Math.round(cappedHeight * scaleFactor);
      effectiveScreenshotWidth = Math.round(
        effectiveScreenshotWidth * scaleFactor
      );
      effectiveScreenshotHeight = Math.round(
        effectiveScreenshotHeight * scaleFactor
      );
    }
    if (cappedHeight > MAX_HEIGHT) {
      const scaleFactor = MAX_HEIGHT / cappedHeight;
      cappedHeight = MAX_HEIGHT;
      cappedWidth = Math.round(cappedWidth * scaleFactor);
      effectiveScreenshotWidth = Math.max(
        1,
        Math.round(cappedWidth - PADDING * 2 * (cappedWidth / finalWidth))
      );
      effectiveScreenshotHeight = Math.max(
        1,
        Math.round(cappedHeight - PADDING * 2 * (cappedHeight / finalHeight))
      );
    }

    console.log(
      `[${validatedTargetUrl}] Final canvas: ${cappedWidth}x${cappedHeight}, Effective screenshot: ${effectiveScreenshotWidth}x${effectiveScreenshotHeight}`
    );

    const htmlContent = `
            <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Screenshot</title><style>
                    html, body { margin: 0; padding: 0; width: ${cappedWidth}px; height: ${cappedHeight}px; overflow: hidden; background-color: #FFF; } /* Added default BG */
                    body { display: flex; justify-content: center; align-items: center;
                           background-image: url('${backgroundImageDataUri}'); background-size: cover; background-position: center; background-repeat: no-repeat; }
                    img#screenshot { display: block; width: ${effectiveScreenshotWidth}px; height: ${effectiveScreenshotHeight}px;
                                   box-shadow: 0 10px 30px rgba(0,0,0,0.35); object-fit: cover; }
            </style></head><body><img id="screenshot" src="${screenshotDataUri}" alt="Website Screenshot"></body></html>`;

    // --- 4. Render HTML & Final Screenshot ---
    console.log(
      `[${validatedTargetUrl}] Setting final viewport: ${cappedWidth}x${cappedHeight}`
    );
    await page.setViewport({
      width: cappedWidth,
      height: cappedHeight,
      deviceScaleFactor: 1,
    });

    console.log(
      `[${validatedTargetUrl}] Setting page content to generated HTML...`
    );
    await page.setContent(htmlContent, {
      waitUntil: "load",
      timeout: HTML_LOAD_TIMEOUT,
    });
    console.log(`[${validatedTargetUrl}] HTML content loaded.`);

    try {
      console.log(`[${validatedTargetUrl}] Waiting for final image element...`);
      await page.waitForSelector("img#screenshot", {
        visible: true,
        timeout: FINAL_IMAGE_WAIT_TIMEOUT,
      });
      console.log(`[${validatedTargetUrl}] Final image element visible.`);
    } catch (waitError) {
      console.warn(
        `[${validatedTargetUrl}] Warning: Waiting for img#screenshot timed out. Taking screenshot anyway.`
      );
    }

    console.log(`[${validatedTargetUrl}] Taking final screenshot...`);
    // Return the buffer directly
    const finalImageBuffer = await page.screenshot({
      type: "jpeg",
      quality: 95,
    });
    console.log(`[${validatedTargetUrl}] Final screenshot captured.`);

    return finalImageBuffer;
  } finally {
    if (browser) {
      console.log(`[${validatedTargetUrl}] Closing browser...`);
      await browser.close();
      console.log(`[${validatedTargetUrl}] Browser closed.`);
    }
  }
}

app.get("/screenshot", async (req, res) => {
  const url = req.query.url;
  const width = parseInt(req.query.width || "") || DEFAULT_VIEWPORT_WIDTH;
  const height = parseInt(req.query.height || "") || DEFAULT_VIEWPORT_HEIGHT;

  if (!url) {
    return res.status(400).send("Missing required query parameter: url");
  }

  let validatedUrl;
  try {
    validatedUrl = new URL(url).toString();
  } catch (_) {
    return res.status(400).send(`Invalid URL provided: ${url}`);
  }

  console.log(
    `Received request for URL: ${validatedUrl}, Size: ${width}x${height}`
  );

  try {
    const imageBuffer = await takeCompositedScreenshot(
      validatedUrl,
      width,
      height
    );
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(imageBuffer);
    console.log(`Successfully sent screenshot for ${validatedUrl}`);
  } catch (error) {
    console.error(
      `[${validatedUrl}] Failed to process screenshot request:`,
      error
    );

    res
      .status(500)
      .send(
        `Error generating screenshot: ${
          error.message || "An internal error occurred"
        }`
      );
  }
});

app.get("/", (req, res) => {
  res.send("Screenshot Service is running. Use /screenshot?url=...");
});

app.listen(port, () => {
  console.log(`Screenshot server listening on http://localhost:${port}`);
});
