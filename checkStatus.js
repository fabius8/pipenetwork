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
            if (url.includes('api.gradient.network/api/sentrynode/get/')) {
                try {
                    const textResponse = await response.text();
                    console.log(textResponse)
                    const responseData = JSON.parse(textResponse);
                    if (!responseData || !responseData.data) return;

                    const { active, ip } = responseData.data;
                    console.log('\n状态检查结果:');
                    console.log(`IP地址: ${ip}`);
                    console.log(`活动状态: ${active ? '正常' : '失败'}`);
                    
                    if (!active) {
                        console.log('\n警告: 节点状态为非活动状态!');
                    }

                    responseHandled = true;
                } catch (error) {
                    // Silently ignore parsing errors
                }
            }
        });

        await page.goto('chrome-extension://caacbgbklghmpodbdafajbgdnegacfmo/popup.html', {
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
    const port = parseInt(process.argv[2]);
    
    if (isNaN(port) || port <= 0) {
        console.log("Usage: node script.js <port>");
        process.exit(1);
    }

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