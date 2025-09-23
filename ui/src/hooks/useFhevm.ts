import { useState, useEffect } from 'react'
import { createInstance, SepoliaConfig } from '@zama-fhe/relayer-sdk'

export const useFhevm = () => {
  const [instance, setInstance] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initFhevm = async () => {
      try {
        // 使用Sepolia配置创建FHEVM实例
        const config = {
          ...SepoliaConfig,
          network: window.ethereum, // 使用MetaMask或其他钱包的provider
        }
        
        const fhevmInstance = await createInstance(config)
        setInstance(fhevmInstance)
        setLoading(false)
      } catch (err) {
        console.error('Failed to initialize FHEVM:', err)
        setError('Failed to initialize FHEVM')
        setLoading(false)
      }
    }

    if (window.ethereum) {
      initFhevm()
    } else {
      setError('No wallet detected')
      setLoading(false)
    }
  }, [])

  return { instance, loading, error }
}