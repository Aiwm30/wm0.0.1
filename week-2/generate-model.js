// generate-model.js — 使用官方通用客户端 CommonClient，彻底解决兼容性问题
import dotenv from 'dotenv';
import { createWriteStream } from 'fs';
import { get } from 'https';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// 加载 .env 环境变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// 导入 CommonClient 通用客户端（官方万能转接头）
import { CommonClient } from 'tencentcloud-sdk-nodejs-common';

const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;

if (!SECRET_ID || !SECRET_KEY) {
    console.error('❌ 请先在 .env 文件中配置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY');
    process.exit(1);
}

// 混元3D服务的专属地址和版本
const API_DOMAIN = 'ai3d.tencentcloudapi.com';
const API_VERSION = '2025-05-13';
const PROMPT = '一把木质椅子';
const OUTPUT_FILE = 'chair.glb';

// 初始化通用客户端（万能转接头），指定要连接的服务
const client = new CommonClient(API_DOMAIN, API_VERSION, {
    credential: {
        secretId: SECRET_ID,
        secretKey: SECRET_KEY,
    },
    region: 'ap-guangzhou',
});

// 调用 API（提交任务）
async function submitJob() {
    console.log('🚀 开始调用混元3D API（通用客户端版）...\n');
    console.log(`📝 提示词: ${PROMPT}\n`);
    console.log('1️⃣ 正在提交生成任务...');
    const result = await client.request('SubmitHunyuanTo3DProJob', { Prompt: PROMPT });
    const jobId = result.JobId;
    if (!jobId) {
        console.error('❌ 提交任务失败，未获取到 JobId');
        console.error(JSON.stringify(result, null, 2));
        process.exit(1);
    }
    console.log(`✅ 任务已提交，JobId: ${jobId}\n`);
    return jobId;
}

// 轮询任务状态（每隔几秒问一次“做完了吗”）
async function waitForJob(jobId) {
    console.log('2️⃣ 正在等待任务完成...');
    let attempt = 0;
    const maxWaitMs = 600000; // 最多等 10 分钟
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        attempt++;
        const result = await client.request('QueryHunyuanTo3DProJob', { JobId: jobId });
        const status = result.Status;
        console.log(`  第 ${attempt} 次查询，状态: ${status}`);

        if (status === 'DONE') return result;
        if (status === 'FAIL') throw new Error(`任务失败: ${result.ErrorMessage} (${result.ErrorCode})`);
        await new Promise(r => setTimeout(r, 5000)); // 等 5 秒再问
    }
    throw new Error('任务超时');
}

// 下载模型文件
function downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(filename);
        get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(filename); });
        }).on('error', reject);
    });
}

// 主流程
async function main() {
    const jobId = await submitJob();
    const queryResult = await waitForJob(jobId);

    const resultFiles = queryResult.ResultFile3Ds;
    if (!resultFiles || resultFiles.length === 0) {
        console.error('❌ 任务完成，但未返回任何模型文件');
        process.exit(1);
    }

    // 优先选 .glb 格式
    const glbFile = resultFiles.find(f => f.Type === 'GLB' || f.Url?.endsWith('.glb'));
    const fileToDownload = glbFile || resultFiles[0];
    console.log(`📁 找到模型文件: ${fileToDownload.Type || '未知格式'} — ${fileToDownload.Url}\n`);

    console.log(`3️⃣ 正在下载模型到 ${OUTPUT_FILE} ...`);
    await downloadFile(fileToDownload.Url, OUTPUT_FILE);

    console.log(`✅ 完成！模型已保存为 ${OUTPUT_FILE}\n`);
    console.log('📊 本次调用清单：');
    console.log(`  - 任务ID: ${jobId}`);
    console.log(`  - 提示词: ${PROMPT}`);
    console.log(`  - 输出文件: ${OUTPUT_FILE}`);
    console.log(`  - API 接口: ${API_DOMAIN}`);
    console.log(`  - API 版本: ${API_VERSION}`);
}

main().catch(err => {
    console.error('💥 脚本执行出错:', err.message);
    process.exit(1);
});