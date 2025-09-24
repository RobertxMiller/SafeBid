import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { type Address, readContract } from 'viem';
import { ethers } from 'ethers';
import { Header } from '../components/Header';
import abi from '../abi/SafeBid.json';
import { SAFEBID_ADDRESS } from '../config/contracts';

type Auction = {
  id: bigint;
  seller: Address;
  itemName: string;
  startPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  active: boolean;
  ended: boolean;
  winner: Address;
  finalPrice: bigint;
};

function formatEth(v: bigint) {
  try { return `${ethers.formatEther(v)} ETH`; } catch { return v.toString(); }
}

export default function Home() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(false);

  const contract = useMemo(() => ({
    address: SAFEBID_ADDRESS as Address,
    abi: abi as any,
  }), []);

  const refresh = async () => {
    if (!publicClient || !SAFEBID_ADDRESS) return;
    setLoading(true);
    try {
      const total = await readContract(publicClient, { ...contract, functionName: 'getTotalAuctions' }) as bigint;
      const items: Auction[] = [];
      for (let i = 0n; i < total; i++) {
        const a = await readContract(publicClient, { ...contract, functionName: 'getAuction', args: [i] }) as unknown as Auction;
        items.push(a);
      }
      setAuctions(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [publicClient]);

  const [name, setName] = useState('');
  const [priceEth, setPriceEth] = useState('');
  const [startInSeconds, setStartInSeconds] = useState(300);

  async function writeWithEthers(method: string, args: any[], value?: bigint) {
    if (!window.ethereum) throw new Error('No wallet');
    const provider = new ethers.BrowserProvider(window.ethereum as any);
    const signer = await provider.getSigner();
    const c = new ethers.Contract(SAFEBID_ADDRESS, abi as any, signer);
    const tx = await c[method](...args, value ? { value } : undefined);
    await tx.wait();
  }

  async function onCreateAuction(e: React.FormEvent) {
    e.preventDefault();
    const startPrice = ethers.parseEther(priceEth || '0');
    const startTime = BigInt(Math.floor(Date.now() / 1000) + Number(startInSeconds));
    await writeWithEthers('createAuction', [name, startPrice, startTime]);
    setName(''); setPriceEth('');
    await refresh();
  }

  async function onPlaceBid(auctionId: bigint, bidValue: number) {
    // Encrypt with Zama Relayer SDK
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const { initSDK, createInstance, SepoliaConfig } = await import('@zama-fhe/relayer-sdk/bundle');
    await initSDK();
    const cfg = { ...SepoliaConfig, network: (window as any).ethereum } as any;
    const instance = await createInstance(cfg);

    const buffer = instance.createEncryptedInput(SAFEBID_ADDRESS, address);
    buffer.add32(BigInt(bidValue));
    const encrypted = await buffer.encrypt();

    await writeWithEthers('placeBid', [auctionId, encrypted.handles[0], encrypted.inputProof]);
    await refresh();
  }

  async function onEnd(auctionId: bigint) {
    await writeWithEthers('endAuction', [auctionId]);
    await refresh();
  }

  async function onCheckEnd(auctionId: bigint) {
    await writeWithEthers('checkAuctionEnd', [auctionId]);
    await refresh();
  }

  async function onEmergency(auctionId: bigint) {
    await writeWithEthers('emergencyStop', [auctionId]);
    await refresh();
  }

  async function onPurchase(auction: Auction) {
    await writeWithEthers('completePurchase', [auction.id], auction.startPrice);
    await refresh();
  }

  return (
    <div>
      <Header />
      <main style={{ maxWidth: 920, margin: '0 auto', padding: 16 }}>
        <section style={{ background: '#fff', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Create Auction</h2>
          <form onSubmit={onCreateAuction} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Item name" value={name} onChange={e => setName(e.target.value)} style={{ padding: 8, flex: 1 }} />
            <input placeholder="Start price (ETH)" value={priceEth} onChange={e => setPriceEth(e.target.value)} style={{ padding: 8, width: 180 }} />
            <input type="number" placeholder="Start in (sec)" value={startInSeconds} onChange={e => setStartInSeconds(Number(e.target.value))} style={{ padding: 8, width: 140 }} />
            <button type="submit" disabled={!address || !name || !priceEth} style={{ padding: '8px 14px' }}>Create</button>
          </form>
        </section>

        <section style={{ background: '#fff', padding: 16, borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ marginTop: 0 }}>Auctions</h2>
            <button onClick={refresh} disabled={loading} style={{ padding: '6px 10px' }}>{loading ? 'Loading...' : 'Refresh'}</button>
          </div>
          {auctions.length === 0 && <div>No auctions</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            {auctions.map(a => (
              <div key={a.id.toString()} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600 }}>{a.itemName}</div>
                <div style={{ color: '#555', fontSize: 13 }}>Seller: {a.seller}</div>
                <div style={{ color: '#555', fontSize: 13 }}>Start price: {formatEth(a.startPrice)}</div>
                <div style={{ color: '#555', fontSize: 13 }}>Start time: {a.startTime.toString()}</div>
                <div style={{ marginTop: 8 }}>
                  {a.active && !a.ended && (
                    <BidBox auctionId={a.id} onPlace={onPlaceBid} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => onCheckEnd(a.id)} disabled={!a.active || a.ended} style={{ padding: '6px 10px' }}>Check End</button>
                  {address === a.seller && (
                    <button onClick={() => onEnd(a.id)} disabled={!a.active || a.ended} style={{ padding: '6px 10px' }}>End</button>
                  )}
                  {address === a.seller && (
                    <button onClick={() => onEmergency(a.id)} disabled={!a.active || a.ended} style={{ padding: '6px 10px' }}>Emergency Stop</button>
                  )}
                  {!a.active && a.ended && address === a.winner && (
                    <button onClick={() => onPurchase(a)} style={{ padding: '6px 10px' }}>Complete Purchase</button>
                  )}
                </div>
                {!a.active && a.ended && (
                  <div style={{ color: '#0a0', marginTop: 6 }}>Winner: {a.winner !== '0x0000000000000000000000000000000000000000' ? a.winner : 'None'}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function BidBox({ auctionId, onPlace }: { auctionId: bigint; onPlace: (id: bigint, bidValue: number) => Promise<void> }) {
  const [bid, setBid] = useState<number>(0);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="number" placeholder="Bid (u32 scaled)" value={bid} onChange={e => setBid(Number(e.target.value))} style={{ padding: 8, width: 180 }} />
      <button onClick={() => onPlace(auctionId, bid)} disabled={bid <= 0} style={{ padding: '6px 10px' }}>Place Bid</button>
    </div>
  );
}

