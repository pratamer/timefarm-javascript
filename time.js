const fs = require('fs');
const axios = require('axios');
const colors = require('colors');
const { DateTime } = require('luxon');
const { parse } = require('querystring');

class Timefarm {
    constructor() {
        this.headers = {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
            'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        };
    }

    setAuthorization(auth) {
        this.headers['Authorization'] = `Bearer ${auth}`;
    }

    delAuthorization() {
        delete this.headers['Authorization'];
    }

    loadToken(id) {
        const tokens = JSON.parse(fs.readFileSync('token.json', 'utf8'));
        return tokens[id] || null;
    }

    saveToken(id, token) {
        const tokens = JSON.parse(fs.readFileSync('token.json', 'utf8'));
        tokens[id] = token;
        fs.writeFileSync('token.json', JSON.stringify(tokens, null, 4), 'utf8');
    }

    async login(data) {
        const url = 'https://tg-bot-tap.laborx.io/api/v1/auth/validate-init/v2';
        const cleanedData = data.replace(/\r/g, '');
        const requestData = {
            initData: cleanedData,
            platform: 'android'
        };
        
        this.delAuthorization();
        try {
            const res = await axios.post(url, requestData, { headers: this.headers });
            if (res.status !== 200) {
                this.log(colors.red(`Login không thành công! Mã trạng thái: ${res.status}`));
                return null;
            }
            const token = res.data.token;
            this.log(colors.green(`Đăng nhập thành công!`));
            return token;
        } catch (error) {
            this.log(colors.red(`Lỗi trong quá trình đăng nhập: ${error.message}`));
            return null;
        }
    }

    async endFarming() {
        const url = 'https://tg-bot-tap.laborx.io/api/v1/farming/finish';
        try {
            const response = await axios.post(url, {}, {
                headers: this.headers
            });

            const balance = response.data.balance;
            this.log(colors.green(`Claim thành công. Balance: ${balance}`));
            await this.startFarming();
        } catch (error) {
            this.log(colors.red('Không thể claim:'));
        }
    }

    async startFarming() {
        const url = 'https://tg-bot-tap.laborx.io/api/v1/farming/start';
        try {
            const response = await axios.post(url, {}, {
                headers: this.headers
            });
            this.log(colors.green('Bắt đầu farming thành công.'));
        } catch (error) {
            this.log(colors.red('Không thể bắt đầu farming:'));
        }
    }
    
    async upgradeWatch() {
        const url = 'https://tg-bot-tap.laborx.io/api/v1/me/level/upgrade';
        try {
            const response = await axios.post(url, {}, { headers: this.headers });
            const { level, balance } = response.data;
            this.log(colors.green(`Nâng cấp thành công đồng hồ lên lv ${level}, balance ${balance}`));
        } catch (error) {
            this.log(colors.red('Tài khoản không đủ để nâng cấp đồng hồ'));
        }
    }
    
    async getBalance(upgradeWatch) {
        const url = 'https://tg-bot-tap.laborx.io/api/v1/farming/info';
        while (true) {
            try {
                const res = await axios.get(url, { headers: this.headers });
                const data = res.data;
                if (!data) {
                    this.log(colors.red('Lấy dữ liệu thất bại'));
                    console.log('Chi tiết lỗi:', res.data);
                    return null;
                }
                const timestamp = DateTime.fromISO(data.activeFarmingStartedAt).toMillis() / 1000;
                const hientai = Math.floor(Date.now() / 1000);
                const balance = data.balance;
                this.log(colors.green('Balance : ') + colors.white(balance));

                if (!data.activeFarmingStartedAt) {
                    this.log(colors.yellow('Farming chưa bắt đầu.'));
                    await this.startFarming();
                    continue;
                }

                if (upgradeWatch) {
                    await this.upgradeWatch();
                }

                const endFarming = timestamp + data.farmingDurationInSec;
                const formatEndFarming = DateTime.fromMillis(endFarming * 1000).toISO().split('.')[0];
                if (hientai > endFarming) {
                    await this.endFarming();
                    continue;
                }
                this.log(colors.yellow('Thời gian hoàn thành farming : ') + colors.white(formatEndFarming));
                let next = Math.floor(endFarming - hientai);
                next += 120;
                return next;
            } catch (error) {
                this.log(colors.red('Lỗi kết nối hoặc truy vấn không thành công'));
                await this.countdown(60); 
            }
        }
    }

    async countdown(t) {
        for (let i = t; i > 0; i--) {
            const hours = String(Math.floor(i / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((i % 3600) / 60)).padStart(2, '0');
            const seconds = String(i % 60).padStart(2, '0').split('.')[0];
            process.stdout.write(colors.white(`[*] Cần chờ ${hours}:${minutes}:${seconds}     \r`));
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        process.stdout.write('\r');
    }

    log(msg) {
        console.log(`[*] ${msg}`);
    }

    async main() {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        readline.question('Có nâng cấp đồng hồ không? (y/n) ', async (answer) => {
            const upgradeWatch = answer.toLowerCase() === 'y';

            readline.close();

            const args = require('yargs').argv;
            const dataFile = args.data || 'data.txt';
            const datas = fs.readFileSync(dataFile, 'utf8')
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && decodeURIComponent(line).includes('user='));

            if (datas.length <= 0) {
                console.log(colors.red(`Không tìm thấy dữ liệu`));
                process.exit();
            }

            while (true) {
                const listCountdown = [];
                const start = Math.floor(Date.now() / 1000);
                for (let i = 0; i < datas.length; i++) {
                    const data = datas[i];

                    const parser = parse(data);
                    const user = JSON.parse(parser.user);
                    const id = user.id;
                    const username = user.first_name;
                    console.log(`========== Tài khoản ${i + 1} | ${username.green} ==========`);

                    let token = this.loadToken(id);
                    if (!token) {
                        this.log(colors.red('Không thể đọc token, đang gửi yêu cầu đăng nhập!'));
                        token = await this.login(data);
                        if (token) {
                            this.saveToken(id, token);
                            this.setAuthorization(token);
                        } else {
                            continue;
                        }
                    } else {
                        this.setAuthorization(token);
                    }

                    const result = await this.getBalance(upgradeWatch);
                    await this.countdown(3); 
                    listCountdown.push(result);
                }
                const end = Math.floor(Date.now() / 1000);
                const total = end - start;
                const min = Math.min(...listCountdown) - total;
                await this.countdown(min);
            }
        });
    }
}

(async () => {
    try {
        const app = new Timefarm();
        await app.main();
    } catch (error) {
        console.error(error);
        process.exit();
    }
})();
