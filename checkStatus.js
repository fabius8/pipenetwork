const puppeteer = require('puppeteer');
const axios = require('axios');

async function connectBrowser(port) {
    try {
        let wsKey = await axios.get(`http://127.0.0.1:${port}/json/version`);
        let browser = await puppeteer.connect({
            browserWSEndpoint: wsKey.data.webSocketDebuggerUrl,
            defaultViewport: null
        });
        return browser;
    } catch (error) {
        return null;
    }
}

async function monitorExtension(port) {
    let browser = await connectBrowser(port);
    let page = null;

    if (!browser) {
        return false;
    }

    try {
        page = await browser.newPage();
        let responseHandled = false;

        page.on('response', async response => {
            const url = response.url();
            if (url.includes('api/points')) {
                try {
                    const textResponse = await response.text();
                    console.log(textResponse)
                    responseHandled = true;
                } catch (error) {
                    // Silently ignore parsing errors
                }
            }
        });

        await page.goto('chrome-extension://gelgmmdfajpefjbiaedgjkpekijhkgbe/popup.html', {
            waitUntil: 'networkidle0',
            timeout: 8000
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (!responseHandled) {
                    reject(new Error('Response timeout'));
                }
            }, 5000);

            const checkResponse = setInterval(() => {
                if (responseHandled) {
                    clearTimeout(timeout);
                    clearInterval(checkResponse);
                    resolve();
                }
            }, 100);
        });

        return true;
    } catch (error) {
        return false;
    } finally {
        if (page) {
            await page.close();
        }
        if (browser) {
            await browser.disconnect();
        }
    }
}

async function main() {
    const index = parseInt(process.argv[2]);
    
    if (isNaN(index) || index <= 0) {
        console.log("Usage: node script.js <index>");
        process.exit(1);
    }

    const port = index + 11500 - 1
    const success = await monitorExtension(port);
    
    if (!success) {
        console.log(`Failed to connect on port ${port}.`);
    }

    process.exit(0);
}

main().catch(() => process.exit(1));

process.on('SIGINT', () => {
    process.exit(0);
});