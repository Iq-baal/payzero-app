import React, { useState, useRef, useEffect } from 'react';
import { QrCode, Scan, Send, Wallet, ArrowUpRight, ArrowDownLeft, Check, Copy, LogOut, X } from 'lucide-react';

// Base Sepolia testnet config
const CHAIN_CONFIG = {
  chainId: '0x14a34', // 84532 in hex
  chainName: 'Base Sepolia',
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
};

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // Base Sepolia USDC

// Simple ERC20 ABI for token transfers
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function symbol() view returns (string)'
];

export default function PayZeroApp() {
  const [view, setView] = useState('welcome'); // welcome, signup, home, send, receive, scan, confirm, success
  const [email, setEmail] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState({ ETH: '0', USDC: '0' });
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [qrData, setQrData] = useState('');
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [scanStream, setScanStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Check if wallet already connected
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          await switchToBaseSepolia();
          await fetchBalances(accounts[0]);
          setView('home');
        }
      } catch (err) {
        console.error('Error checking connection:', err);
      }
    }
  };

  const switchToBaseSepolia = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_CONFIG.chainId }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [CHAIN_CONFIG],
          });
        } catch (addError) {
          throw new Error('Failed to add Base Sepolia network');
        }
      }
    }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      setError('Please install MetaMask to continue');
      return;
    }

    setIsConnecting(true);
    setError('');

    try {
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      setWalletAddress(accounts[0]);
      await switchToBaseSepolia();
      await fetchBalances(accounts[0]);
      setView('home');
    } catch (err) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const fetchBalances = async (address) => {
    try {
      // Fetch ETH balance
      const ethBalance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      const ethInEther = parseInt(ethBalance, 16) / 1e18;
      
      // Fetch USDC balance
      const data = '0x70a08231' + '000000000000000000000000' + address.slice(2);
      const usdcBalance = await window.ethereum.request({
        method: 'eth_call',
        params: [{
          to: USDC_ADDRESS,
          data: data
        }, 'latest']
      });
      const usdcAmount = parseInt(usdcBalance, 16) / 1e6; // USDC has 6 decimals
      
      setBalance({
        ETH: ethInEther.toFixed(4),
        USDC: usdcAmount.toFixed(2)
      });
    } catch (err) {
      console.error('Error fetching balances:', err);
    }
  };

  const generateQR = () => {
    const paymentData = {
      address: walletAddress,
      token: selectedToken,
      amount: amount || null,
      chain: 'base-sepolia'
    };
    setQrData(JSON.stringify(paymentData));
    setView('receive');
  };

  const startScanning = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setScanStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setView('scan');
      // In production, use a QR code library like jsQR to detect codes
    } catch (err) {
      setError('Camera access denied');
    }
  };

  const stopScanning = () => {
    if (scanStream) {
      scanStream.getTracks().forEach(track => track.stop());
      setScanStream(null);
    }
  };

  const sendPayment = async () => {
    setIsConnecting(true);
    setError('');

    try {
      let txHash;
      
      if (selectedToken === 'ETH') {
        // Send ETH
        const amountInWei = '0x' + (parseFloat(amount) * 1e18).toString(16);
        txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: walletAddress,
            to: recipient,
            value: amountInWei,
          }],
        });
      } else {
        // Send USDC (ERC20)
        const amountInUnits = (parseFloat(amount) * 1e6).toString(16).padStart(64, '0');
        const toAddress = recipient.slice(2).padStart(64, '0');
        const data = '0xa9059cbb' + toAddress + amountInUnits; // transfer(address,uint256)
        
        txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: walletAddress,
            to: USDC_ADDRESS,
            data: data,
          }],
        });
      }
      
      setTxHash(txHash);
      setView('success');
      
      // Refresh balances after transaction
      setTimeout(() => fetchBalances(walletAddress), 2000);
    } catch (err) {
      setError(err.message || 'Transaction failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setWalletAddress('');
    setBalance({ ETH: '0', USDC: '0' });
    setView('welcome');
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
  };

  // Simple SVG QR code representation
  const QRCodeDisplay = ({ data }) => {
    const gridSize = 25;
    const hash = data ? data.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0) | 0, 0) : 0;
    
    return (
      <div className="bg-white p-6 rounded-2xl">
        <svg width="240" height="240" viewBox="0 0 25 25">
          {Array.from({ length: gridSize }, (_, i) => 
            Array.from({ length: gridSize }, (_, j) => {
              const val = (i * gridSize + j + hash) % 3;
              return (
                <rect
                  key={`${i}-${j}`}
                  x={j}
                  y={i}
                  width="1"
                  height="1"
                  fill={val === 0 ? '#000' : '#fff'}
                />
              );
            })
          )}
        </svg>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Welcome View */}
        {view === 'welcome' && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Wallet className="text-white" size={40} />
              </div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">PayZero</h1>
              <p className="text-gray-600">Instant crypto payments on Base Sepolia testnet</p>
            </div>

            <div className="space-y-4">
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-sm text-blue-800 mb-2">
                  <strong>Testnet Setup:</strong>
                </p>
                <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                  <li>Install MetaMask browser extension</li>
                  <li>Get Base Sepolia ETH from faucet</li>
                  <li>Get test USDC from Base Sepolia faucet</li>
                  <li>Connect your wallet to start</li>
                </ol>
              </div>

              <div className="text-center">
                <a 
                  href="https://www.alchemy.com/faucets/base-sepolia" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-purple-600 hover:underline"
                >
                  Get testnet tokens →
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Home View */}
        {view === 'home' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">PayZero</h1>
                <p className="text-xs text-gray-500 font-mono">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={copyAddress} className="p-2 hover:bg-gray-100 rounded-lg">
                  <Copy size={20} className="text-gray-600" />
                </button>
                <button onClick={disconnect} className="p-2 hover:bg-gray-100 rounded-lg">
                  <LogOut size={20} className="text-gray-600" />
                </button>
              </div>
            </div>

            {/* Balance Card */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-6 mb-6 text-white">
              <p className="text-sm opacity-80 mb-2">Base Sepolia Testnet</p>
              <h2 className="text-3xl font-bold mb-4">
                ${(parseFloat(balance.USDC) + parseFloat(balance.ETH) * 2000).toFixed(2)}
              </h2>
              <div className="flex gap-2">
                <div className="bg-white/20 rounded-lg px-3 py-1 text-sm">
                  {balance.ETH} ETH
                </div>
                <div className="bg-white/20 rounded-lg px-3 py-1 text-sm">
                  {balance.USDC} USDC
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <button
                onClick={() => setView('send')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-purple-50 hover:bg-purple-100 transition"
              >
                <Send className="text-purple-600" size={24} />
                <span className="text-sm font-medium text-gray-700">Send</span>
              </button>
              <button
                onClick={generateQR}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition"
              >
                <QrCode className="text-blue-600" size={24} />
                <span className="text-sm font-medium text-gray-700">Receive</span>
              </button>
              <button
                onClick={startScanning}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-cyan-50 hover:bg-cyan-100 transition"
              >
                <Scan className="text-cyan-600" size={24} />
                <span className="text-sm font-medium text-gray-700">Scan</span>
              </button>
            </div>

            <button
              onClick={() => fetchBalances(walletAddress)}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
            >
              Refresh Balances
            </button>
          </div>
        )}

        {/* Send View */}
        {view === 'send' && (
          <div className="p-6">
            <button onClick={() => setView('home')} className="mb-6 text-purple-600 font-medium">
              ← Back
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Send Payment</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-transparent font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Token</label>
                <select
                  value={selectedToken}
                  onChange={(e) => setSelectedToken(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                  <option value="ETH">ETH - {balance.ETH} available</option>
                  <option value="USDC">USDC - {balance.USDC} available</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                <input
                  type="number"
                  step="0.000001"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-600 focus:border-transparent text-2xl font-bold"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <button
                onClick={() => setView('confirm')}
                disabled={!recipient || !amount || !recipient.startsWith('0x')}
                className="w-full py-4 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Receive/QR View */}
        {view === 'receive' && (
          <div className="p-6">
            <button onClick={() => setView('home')} className="mb-6 text-purple-600 font-medium">
              ← Back
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Receive Payment</h2>
            
            <div className="flex flex-col items-center space-y-4">
              <QRCodeDisplay data={qrData} />
              <div className="text-center">
                <p className="text-sm font-mono text-gray-600 mb-2">
                  {walletAddress.slice(0, 12)}...{walletAddress.slice(-12)}
                </p>
                <p className="text-xs text-gray-500">Base Sepolia Testnet</p>
              </div>
              
              <button
                onClick={copyAddress}
                className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-600 rounded-xl font-medium hover:bg-purple-200 transition"
              >
                <Copy size={16} />
                Copy Address
              </button>

              <div className="w-full pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  Scan this QR code or send directly to the address above
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scan View */}
        {view === 'scan' && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => { stopScanning(); setView('home'); }} className="text-purple-600 font-medium">
                ← Back
              </button>
              <button onClick={stopScanning} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Scan QR Code</h2>
            
            <div className="flex flex-col items-center space-y-4">
              <div className="w-full aspect-square bg-gray-900 rounded-2xl flex items-center justify-center relative overflow-hidden">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-8 border-2 border-purple-500 rounded-xl"></div>
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <p className="text-gray-600">Position QR code within frame</p>
              <p className="text-xs text-gray-500">Camera scanning active...</p>
            </div>
          </div>
        )}

        {/* Confirm View */}
        {view === 'confirm' && (
          <div className="p-6">
            <button onClick={() => setView('send')} className="mb-6 text-purple-600 font-medium">
              ← Back
            </button>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Confirm Payment</h2>
            
            <div className="bg-gray-50 rounded-2xl p-6 mb-6 space-y-4">
              <div className="flex justify-between items-start">
                <span className="text-gray-600">To</span>
                <span className="font-mono text-sm text-gray-900 text-right break-all">
                  {recipient.slice(0, 16)}...{recipient.slice(-16)}
                </span>
              </div>
              <div className="border-t border-gray-200"></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Amount</span>
                <span className="text-2xl font-bold text-gray-900">{amount} {selectedToken}</span>
              </div>
              <div className="border-t border-gray-200"></div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Network</span>
                <span className="text-sm text-gray-900">Base Sepolia</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Gas Fee</span>
                <span className="text-sm text-green-600">~$0.001 (testnet)</span>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-800">
                ⚡ You'll be prompted to confirm in your wallet
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              onClick={sendPayment}
              disabled={isConnecting}
              className="w-full py-4 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition disabled:opacity-50"
            >
              {isConnecting ? 'Sending...' : `Send ${amount} ${selectedToken}`}
            </button>
          </div>
        )}

        {/* Success View */}
        {view === 'success' && (
          <div className="p-6 flex flex-col items-center justify-center min-h-[500px]">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <Check className="text-green-600" size={40} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Sent!</h2>
            <p className="text-gray-600 mb-2 text-center">
              {amount} {selectedToken} sent successfully
            </p>
            <p className="text-xs text-gray-500 mb-6 font-mono break-all text-center px-4">
              {recipient}
            </p>
            
            <div className="bg-gray-50 rounded-xl p-4 w-full mb-6">
              <p className="text-xs text-gray-500 mb-1">Transaction Hash:</p>
              <p className="text-xs font-mono text-gray-900 break-all">{txHash}</p>
            </div>

            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 text-sm hover:underline mb-6"
            >
              View on Block Explorer →
            </a>

            <button
              onClick={() => {
                setView('home');
                setAmount('');
                setRecipient('');
                setTxHash('');
              }}
              className="w-full py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition"
            >
              Done
            </button>
          </div>
        )}
        
      </div>
    </div>
  );
}
