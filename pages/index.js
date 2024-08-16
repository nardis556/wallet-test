import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { EthereumProvider } from '@walletconnect/ethereum-provider';
import { CHAIN_CONFIG } from '../config/chains';
import { ChakraProvider, Box, VStack, Heading, Select, Button, Image, Text, HStack, useToast, Table, Thead, Tbody, Tr, Th, Td, extendTheme } from '@chakra-ui/react';

// Define the dark mode theme
const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
});

// Utility functions
const sanitizeChainId = (chainId) =>
  typeof chainId === "string" ? parseInt(chainId, 16) : Number(chainId);

const showToast = (toast, title, description, status) => {
  toast({ title, description, status, duration: 3000, isClosable: true });
};

export default function Home() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState('');
  const [chainId, setChainId] = useState(null);
  const [eip6963Providers, setEip6963Providers] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [browserProvider, setBrowserProvider] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);
  const [isSendingTransaction, setIsSendingTransaction] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [wcProvider, setWcProvider] = useState(null);
  const toast = useToast();

  const showSuccessToast = (title, description) => showToast(toast, title, description, "success");
  const showErrorToast = (title, description) => showToast(toast, title, description, "error");

  const initializeProvider = useCallback(async () => {
    if (!provider) return null;
    const newBrowserProvider = new ethers.BrowserProvider(provider, "any");
    const network = await newBrowserProvider.getNetwork();
    console.log("Initialize provider network:", network);
    setBrowserProvider(newBrowserProvider);
    setChainId(sanitizeChainId(network.chainId));
    return newBrowserProvider;
  }, [provider]);

  useEffect(() => {
    const handleEip6963Announce = (event) => {
      const { info, provider } = event.detail;
      setEip6963Providers((prevProviders) => {
        return prevProviders.some((p) => p.info.uuid === info.uuid)
          ? prevProviders
          : [...prevProviders, { info, provider }];
      });
    };

    window.addEventListener('eip6963:announceProvider', handleEip6963Announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    return () => {
      window.removeEventListener('eip6963:announceProvider', handleEip6963Announce);
    };
  }, []);

  useEffect(() => {
    if (provider) initializeProvider();
  }, [provider, initializeProvider]);

  const connectWallet = async (selectedProvider) => {
    setIsConnecting(true);
    try {
      let ethersProvider;
      if (selectedProvider.info.rdns.includes('walletconnect')) {
        const newWcProvider = await EthereumProvider.init({
          projectId: 'dbe9fe1215dbe847681ac3dc99af6226',
          chains: [1],
          showQrModal: true,
          optionalChains: Object.values(CHAIN_CONFIG).map(config => sanitizeChainId(config.chainId)),
        });
        await newWcProvider.enable();
        ethersProvider = new ethers.BrowserProvider(newWcProvider, "any");
        setProvider(newWcProvider);
        setWcProvider(newWcProvider);

        newWcProvider.on("accountsChanged", handleAccountsChanged);
        newWcProvider.on("chainChanged", handleChainChanged);
      } else if (selectedProvider.info.rdns.includes('trust')) {
        // Trust Wallet specific implementation
        if (typeof window.ethereum !== 'undefined' && window.ethereum.isTrust) {
          await window.ethereum.request({ method: "eth_requestAccounts" });
          ethersProvider = new ethers.BrowserProvider(window.ethereum, "any");
          setProvider(window.ethereum);

          window.ethereum.on("accountsChanged", handleAccountsChanged);
          window.ethereum.on("chainChanged", handleChainChanged);
        } else {
          throw new Error("Trust Wallet is not installed");
        }
      } else if (selectedProvider.info.rdns.includes('coinbase')) {
        // Coinbase Wallet specific implementation
        if (typeof window.ethereum !== 'undefined' && window.ethereum.isCoinbaseWallet) {
          await window.ethereum.request({ method: "eth_requestAccounts" });
          ethersProvider = new ethers.BrowserProvider(window.ethereum, "any");
          setProvider(window.ethereum);

          window.ethereum.on("accountsChanged", handleAccountsChanged);
          window.ethereum.on("chainChanged", handleChainChanged);
        } else {
          throw new Error("Coinbase Wallet is not installed");
        }
      } else {
        await selectedProvider.provider.request({ method: "eth_requestAccounts" });
        ethersProvider = new ethers.BrowserProvider(selectedProvider.provider, "any");
        setProvider(selectedProvider.provider);

        selectedProvider.provider.on("accountsChanged", handleAccountsChanged);
        selectedProvider.provider.on("chainChanged", handleChainChanged);
      }

      const signer = await ethersProvider.getSigner();
      const account = await signer.getAddress();
      const network = await ethersProvider.getNetwork();

      setBrowserProvider(ethersProvider);
      setSigner(signer);
      setAddress(account);
      setChainId(sanitizeChainId(network.chainId));
      setSelectedWallet(selectedProvider.info);

      showSuccessToast("Wallet Connected", `Connected to account ${account.slice(0, 6)}...${account.slice(-4)}`);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      showErrorToast("Connection Error", "Failed to connect wallet. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    if (wcProvider?.disconnect) wcProvider.disconnect();
    if (provider?.disconnect) provider.disconnect();
    setProvider(null);
    setBrowserProvider(null);
    setSigner(null);
    setAddress('');
    setSelectedWallet(null);
    setChainId(null);
    setWcProvider(null);
    showToast(toast, "Wallet Disconnected", "Your wallet has been disconnected.", "info");
  };

  const handleAccountsChanged = (accounts) => {
    accounts.length === 0 ? disconnectWallet() : setAddress(accounts[0]);
  };

  const handleChainChanged = async (chainId) => {
    const newChainId = sanitizeChainId(chainId);
    console.log(`Chain changed to: ${newChainId}`);
    setChainId(newChainId);

    if (provider) {
      const newBrowserProvider = new ethers.BrowserProvider(provider, "any");
      setBrowserProvider(newBrowserProvider);

      try {
        const signer = await newBrowserProvider.getSigner();
        const account = await signer.getAddress();
        setAddress(account);
        setSigner(signer);
        console.log(`Updated signer for chain ${newChainId}, account: ${account}`);
      } catch (error) {
        console.error('Error getting signer after chain change:', error);
        showErrorToast("Chain Change Error", "Failed to update signer after chain change.");
      }
    }
  };

  const switchChain = async (chainName) => {
    setIsSwitchingChain(true);
    const chainConfig = CHAIN_CONFIG[chainName];
    if (!chainConfig) {
      setIsSwitchingChain(false);
      return;
    }

    const targetChainId = sanitizeChainId(chainConfig.chainId);
    const formattedChainId = `0x${targetChainId.toString(16)}`;

    console.log(`Attempting to switch to network: ${chainName} (${formattedChainId})`);

    try {
      if (chainId === targetChainId) {
        console.log(`Already on the correct chain: ${chainConfig.chainName}`);
        setIsSwitchingChain(false);
        return;
      }

      if (wcProvider) {
        await wcProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: formattedChainId }],
        });
      } else if (provider) {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: formattedChainId }],
        });
      } else {
        throw new Error("No provider available");
      }
      console.log(`Switched to chain: ${formattedChainId}`);

      // For Trust Wallet, we'll update the state immediately
      if (provider && provider.isTrust) {
        setChainId(targetChainId);
        const newBrowserProvider = new ethers.BrowserProvider(provider, "any");
        setBrowserProvider(newBrowserProvider);
        const newSigner = await newBrowserProvider.getSigner();
        setSigner(newSigner);
        showSuccessToast("Network Switched", `Switched to ${chainConfig.chainName}`);
      } else {
        // For other wallets, we'll wait for the chainChanged event
        await new Promise(resolve => {
          const chainChangedHandler = (newChainId) => {
            console.log(`Chain changed event received: ${newChainId}`);
            if (wcProvider) {
              wcProvider.removeListener("chainChanged", chainChangedHandler);
            } else if (provider) {
              provider.removeListener("chainChanged", chainChangedHandler);
            }
            resolve();
          };
          if (wcProvider) {
            wcProvider.on("chainChanged", chainChangedHandler);
          } else if (provider) {
            provider.on("chainChanged", chainChangedHandler);
          }
        });

        const newBrowserProvider = await initializeProvider();
        const newSigner = await newBrowserProvider.getSigner();
        setSigner(newSigner);

        console.log(`Provider re-initialized after chain switch. New chain ID: ${await newBrowserProvider.getNetwork().then(network => network.chainId)}`);

        showSuccessToast("Network Switched", `Switched to ${chainConfig.chainName}`);
      }
    } catch (error) {
      console.error(`Error switching network:`, error);
      if (error.code === 4902 || (error.data && error.data.originalError && error.data.originalError.code === 4902) ||
        (error.code === -32603 && error.message.includes("Unrecognized chain ID"))) {
        try {
          await addNetwork(chainConfig, formattedChainId);
          showSuccessToast("Network Added", `Added and switched to ${chainConfig.chainName}`);
        } catch (addError) {
          showErrorToast("Network Addition Failed", `Failed to add ${chainConfig.chainName}: ${addError.message}`);
        }
      } else {
        showErrorToast("Network Switch Failed", `Failed to switch to ${chainConfig.chainName}: ${error.message}`);
      }
    } finally {
      setIsSwitchingChain(false);
    }
  };

  const addNetwork = async (chainConfig, formattedChainId) => {
    const params = [{
      chainId: formattedChainId,
      chainName: chainConfig.chainName,
      nativeCurrency: chainConfig.nativeCurrency,
      rpcUrls: chainConfig.rpcUrls,
      blockExplorerUrls: chainConfig.blockExplorerUrls
    }];

    if (wcProvider) {
      await wcProvider.request({
        method: "wallet_addEthereumChain",
        params: params
      });
    } else if (provider) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: params
      });
    } else {
      throw new Error("No provider available");
    }
    console.log(`Added network: ${chainConfig.chainName}`);
    await switchChain(chainConfig.chainName);
  };

  const sendTransaction = async (chainName) => {
    if (!signer) return;
    setIsSendingTransaction(true);
    try {
      const chainConfig = CHAIN_CONFIG[chainName];
      if (!chainConfig) throw new Error(`Invalid chain name: ${chainName}`);

      const targetChainId = sanitizeChainId(chainConfig.chainId);

      console.log(`Preparing to send transaction on ${chainName} (Chain ID: ${targetChainId})`);
      console.log(`Current chain ID: ${chainId}`);

      if (chainId !== targetChainId) {
        console.log(`Chain mismatch. Switching to ${chainName}...`);
        await switchChain(chainName);

        await new Promise(resolve => setTimeout(resolve, 2000));

        const newBrowserProvider = await initializeProvider();
        const newSigner = await newBrowserProvider.getSigner();
        setSigner(newSigner);

        const currentChainId = await newBrowserProvider.getNetwork().then(network => sanitizeChainId(network.chainId));
        console.log(`After switch: Current chain ID: ${currentChainId}, Target chain ID: ${targetChainId}`);
        if (currentChainId !== targetChainId) {
          throw new Error(`Failed to switch to the correct chain. Expected ${targetChainId}, got ${currentChainId}`);
        }
      }

      const address = await signer.getAddress();
      const nonce = await browserProvider.getTransactionCount(address);
      const gasLimit = await browserProvider.estimateGas({
        to: address,
        value: ethers.parseEther("0"),
      });

      let transaction = {
        to: address,
        value: ethers.parseEther("0"),
        nonce: nonce,
        data: "0x",
        // gasLimit: (gasLimit * BigInt(120)) / BigInt(100),
        chainId: targetChainId,
        type: 2
      };

      // const feeData = await browserProvider.getFeeData();
      // transaction.maxFeePerGas = feeData.maxFeePerGas;
      // transaction.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      // transaction.type = 2;

      console.log(`Sending transaction:`, transaction);

      const tx = await signer.sendTransaction(transaction);
      console.log(`Transaction sent:`, tx.hash);
      const receipt = await tx.wait();
      console.log(`Transaction confirmed on ${chainName}:`, receipt.hash);
      showSuccessToast("Transaction Sent", `Transaction successfully sent on ${chainName}`);
    } catch (error) {
      console.error('Error sending transaction:', error);
      showErrorToast("Transaction Error", `Failed to send transaction on ${chainName}: ${error.message}`);
    } finally {
      setIsSendingTransaction(false);
    }
  };

  const clearLocalStorageAndRefresh = () => {
    setIsClearing(true);
    localStorage.clear();
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          caches.delete(name);
        });
      });
    }
    showSuccessToast("Storage Cleared", "Local storage and cache have been cleared.");
    setTimeout(() => {
      window.location.reload(true);
    }, 1000);
  };

  return (
    <ChakraProvider theme={theme}>
      <Box maxWidth="800px" margin="auto" padding={8}>
        <VStack spacing={8} align="stretch">
          <Heading as="h1" size="xl" textAlign="center">wallet-test-app</Heading>

          {!selectedWallet ? (
            <Box>
              <Heading as="h2" size="lg" mb={4}>Connect Wallet</Heading>
              <Select placeholder="Select a wallet" onChange={(e) => connectWallet(eip6963Providers[e.target.value])} mb={4}>
                {eip6963Providers.map((provider, index) => (
                  <option key={index} value={index}>
                    {provider.info.name}
                  </option>
                ))}
              </Select>
              <Button onClick={() => connectWallet({ info: { rdns: 'walletconnect' } })} colorScheme="blue" width="100%" mb={4} isLoading={isConnecting} loadingText="Connecting">
                Connect with WalletConnect | broken
              </Button>
            </Box>
          ) : (
            <Box>
              <Heading as="h2" size="lg" mb={4}>Connected Wallet</Heading>
              <HStack justifyContent="space-between">
                <HStack>
                  <Image src={selectedWallet.icon} alt={selectedWallet.name} boxSize="24px" />
                  <Text>{selectedWallet.name}: {address.slice(0, 4)}...{address.slice(-2)}</Text>
                </HStack>
                <Button onClick={disconnectWallet} colorScheme="red">
                  Disconnect
                </Button>
              </HStack>
            </Box>
          )}

          <Box>
            <Heading as="h2" size="lg" mb={4}>Chain Information</Heading>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Chain</Th>
                  <Th>Chain ID</Th>
                  <Th>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {Object.entries(CHAIN_CONFIG).map(([chainName, config]) => (
                  <Tr key={chainName}>
                    <Td>{config.chainName}</Td>
                    <Td>{config.chainId}</Td>
                    <Td>
                      <Button onClick={() => switchChain(chainName)} colorScheme="blue" mr={2} isLoading={isSwitchingChain} loadingText="Switching">
                        Switch
                      </Button>
                      <Button onClick={() => sendTransaction(chainName)} colorScheme="green" isLoading={isSendingTransaction} loadingText="Sending">
                        Send 0 ETH
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>

          <Box>
            <Button onClick={clearLocalStorageAndRefresh} colorScheme="red" isLoading={isClearing} loadingText="Clearing">
              Clear Local Storage and Refresh
            </Button>
          </Box>
        </VStack>
      </Box>
    </ChakraProvider>
  );
}
