import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import CreateAuction from './components/CreateAuction'
import AuctionList from './components/AuctionList'
import PlaceBid from './components/PlaceBid'

function App() {
  const { isConnected } = useAccount()
  const [activeTab, setActiveTab] = useState<'auctions' | 'create' | 'bid'>('auctions')

  return (
    <div className="container">
      <div className="header">
        <h1>SafeBid</h1>
        <p>链上保密竞拍系统</p>
        <ConnectButton />
      </div>

      {!isConnected ? (
        <div className="card">
          <p>请先连接钱包以使用SafeBid保密竞拍系统</p>
        </div>
      ) : (
        <div>
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'auctions' ? 'active' : ''}`}
              onClick={() => setActiveTab('auctions')}
            >
              拍卖列表
            </button>
            <button
              className={`tab ${activeTab === 'create' ? 'active' : ''}`}
              onClick={() => setActiveTab('create')}
            >
              创建拍卖
            </button>
            <button
              className={`tab ${activeTab === 'bid' ? 'active' : ''}`}
              onClick={() => setActiveTab('bid')}
            >
              参与竞拍
            </button>
          </div>

          {activeTab === 'auctions' && <AuctionList />}
          {activeTab === 'create' && <CreateAuction />}
          {activeTab === 'bid' && <PlaceBid />}
        </div>
      )}
    </div>
  )
}

export default App