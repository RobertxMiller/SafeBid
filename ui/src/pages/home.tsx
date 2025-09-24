import { useEffect, useMemo, useState } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { type Address } from 'viem';
import { ethers } from 'ethers';
import { Header } from '../components/Header';
import abi from '../abi/SafeBid.json';
import { SAFEBID_ADDRESS } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';

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
type AuctionItem = Auction & { lastBidTime: bigint };

function formatEth(v: bigint) {
  try { return `${ethers.formatEther(v)} ETH`; } catch { return v.toString(); }
}

function formatLocalTime(ts: bigint) {
  try {
    return new Date(Number(ts) * 1000).toLocaleString();
  } catch {
    return ts.toString();
  }
}

export default function Home() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { instance: zama, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();
  const hasContract = typeof SAFEBID_ADDRESS === 'string' && SAFEBID_ADDRESS?.length === 42;
  const [bidTimeout, setBidTimeout] = useState<bigint>(600n);
  const [nowTs, setNowTs] = useState<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const contract = useMemo(() => ({
    address: SAFEBID_ADDRESS as Address,
    abi: abi as any,
  }), []);

  const refresh = async () => {
    if (!publicClient || !SAFEBID_ADDRESS) return;
    setLoading(true);
    try {
      // Fetch BID_TIMEOUT constant
      try {
        const bt = await publicClient.readContract({ ...contract, functionName: 'BID_TIMEOUT' }) as bigint;
        if (bt && typeof bt === 'bigint') setBidTimeout(bt);
      } catch {}

      const total = await publicClient.readContract({ ...contract, functionName: 'getTotalAuctions' }) as bigint;
      const items: AuctionItem[] = [];
      for (let i = 0n; i < total; i++) {
        const a = await publicClient.readContract({ ...contract, functionName: 'getAuction', args: [i] }) as unknown as Auction;
        const lbt = await publicClient.readContract({ ...contract, functionName: 'lastBidTime', args: [i] }) as bigint;
        items.push({ ...(a as Auction), lastBidTime: lbt });
      }
      setAuctions(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [publicClient]);

  const [name, setName] = useState('');
  const [priceEth, setPriceEth] = useState('');
  // start time fixed to now + 30s by requirement

  async function writeWithEthers(method: string, args: any[], value?: bigint) {
    if (!hasContract) throw new Error('Contract address not configured');
    if (!signerPromise) throw new Error('No wallet');
    const signer = await signerPromise;
    const c = new ethers.Contract(SAFEBID_ADDRESS, abi as any, signer);
    const tx = value !== undefined ? await c[method](...args, { value }) : await c[method](...args);
    await tx.wait();
  }

  async function onCreateAuction(e: React.FormEvent) {
    e.preventDefault();
    const startPrice = ethers.parseEther(priceEth || '0');
    const startTime = BigInt(Math.floor(Date.now() / 1000) + 30);
    await writeWithEthers('createAuction', [name, startPrice, startTime]);
    setName(''); setPriceEth('');
    await refresh();
  }

  async function onPlaceBid(auctionId: bigint, seller: Address, bidInput: string) {
    if (!zama) throw new Error('Encryption not ready');
    if (!address) throw new Error('Wallet not connected');
    if (address.toLowerCase() === seller.toLowerCase()) {
      window.alert('You cannot bid on your own auction');
      return;
    }
    const SCALE = 1e9; // scale ETH decimals to u32 integer
    const parsed = parseFloat(bidInput);
    if (!isFinite(parsed) || parsed <= 0) throw new Error('Invalid bid value');
    const scaled = Math.round(parsed * SCALE);
    if (scaled <= 0 || scaled > 0xFFFFFFFF) throw new Error('Bid out of range (max 4.294967295 ETH)');
    const buffer = zama.createEncryptedInput(SAFEBID_ADDRESS, address);
    buffer.add32(BigInt(scaled));
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
        {!hasContract && (
          <div style={{ background: '#fff3cd', color: '#664d03', padding: 12, borderRadius: 8, marginBottom: 12 }}>
            Contract address not configured. Please deploy and run `npm run sync:frontend`.
          </div>
        )}
        <section style={{ background: '#fff', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Create Auction</h2>
          <form onSubmit={onCreateAuction} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Item name" value={name} onChange={e => setName(e.target.value)} style={{ padding: 8, flex: 1 }} />
            <input placeholder="Start price (ETH)" value={priceEth} onChange={e => setPriceEth(e.target.value)} style={{ padding: 8, width: 180 }} />
            <button type="submit" disabled={!hasContract || !address || !name || !priceEth} style={{ padding: '8px 14px' }}>Create</button>
          </form>
        </section>

        <section style={{ background: '#fff', padding: 16, borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ marginTop: 0 }}>Auctions</h2>
            <button onClick={refresh} disabled={loading} style={{ padding: '6px 10px' }}>{loading ? 'Loading...' : 'Refresh'}</button>
            
          </div>
          <p>You bid price is encrypted</p>
          {auctions.length === 0 && <div>No auctions</div>}
          <div style={{ display: 'grid', gap: 12 }}>
            {auctions.map(a => (
              <div key={a.id.toString()} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600 }}>{a.itemName}</div>
                <div style={{ color: '#555', fontSize: 13 }}>Seller: {a.seller}</div>
                <div style={{ color: '#555', fontSize: 13 }}>Start price: {formatEth(a.startPrice)}</div>
                <div style={{ color: '#555', fontSize: 13 }}>Start time: {formatLocalTime(a.startTime)}</div>
                <TimerRow a={a} nowTs={nowTs} bidTimeout={bidTimeout} />
                <div style={{ marginTop: 8 }}>
                  {a.active && !a.ended && (
                    <BidBox 
                      auctionId={a.id} 
                      seller={a.seller}
                      onPlace={onPlaceBid} 
                      disabled={
                        zamaLoading || !zama || !!zamaError ||
                        (!!address && address.toLowerCase() === a.seller.toLowerCase())
                      } 
                    />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => onCheckEnd(a.id)} disabled={!a.active || a.ended} style={{ padding: '6px 10px' }}>Check End</button>
                  <DecryptMyBidButton a={a} address={address} publicClient={publicClient} zama={zama} signerPromise={signerPromise} />
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

function BidBox({ auctionId, seller, onPlace, disabled }: { auctionId: bigint; seller: Address; onPlace: (id: bigint, seller: Address, bidValue: string) => Promise<void>; disabled?: boolean }) {
  const [bid, setBid] = useState<string>('');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="number" step="0.000000001" placeholder="Bid (ETH, ≤ 4.294967295)" value={bid} onChange={e => setBid(e.target.value)} style={{ padding: 8, width: 220 }} />
      <button onClick={() => onPlace(auctionId, seller, bid)} disabled={disabled || !bid} style={{ padding: '6px 10px' }}>Place Bid</button>
    </div>
  );
}

function TimerRow({ a, nowTs, bidTimeout }: { a: AuctionItem; nowTs: number; bidTimeout: bigint }) {
  const now = BigInt(nowTs);
  let label = '';
  let endAt: bigint | null = null;
  if (!a.active) {
    label = a.ended ? 'Ended' : 'Inactive';
  } else if (now < a.startTime) {
    const secs = a.startTime - now;
    label = `Starts in: ${formatDuration(secs)}`;
  } else {
    endAt = a.lastBidTime + bidTimeout;
    const remain = endAt > now ? endAt - now : 0n;
    label = remain > 0n ? `Ends in: ${formatDuration(remain)}` : 'Pending end: please Check End';
  }
  return (
    <div style={{ color: '#d97706', fontSize: 13, marginTop: 4 }}>
      {label}
      {endAt && (
        <span> • Ends at: {formatLocalTime(endAt)}</span>
      )}
    </div>
  );
}

function formatDuration(seconds: bigint) {
  let s = Number(seconds);
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [] as string[];
  if (h) parts.push(`${h}h`);
  if (m || h) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

function DecryptMyBidButton({ a, address, publicClient, zama, signerPromise }: { a: AuctionItem; address?: Address; publicClient: any; zama: any; signerPromise: Promise<any> | undefined }) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const onClick = async () => {
    try {
      if (!address) { window.alert('请先连接钱包'); return; }
      if (!zama) { window.alert('加密服务未就绪'); return; }
      if (!publicClient) { window.alert('网络未就绪'); return; }
      setBusy(true);
      // Find latest bid from this user
      const count = await publicClient.readContract({ address: SAFEBID_ADDRESS as Address, abi: abi as any, functionName: 'getBidCount', args: [a.id] }) as bigint;
      let handle: string | null = null;
      for (let i = count - 1n; i >= 0; i--) {
        const rec = await publicClient.readContract({ address: SAFEBID_ADDRESS as Address, abi: abi as any, functionName: 'auctionBids', args: [a.id, i] }) as any;
        const [bidder, encryptedAmount] = rec as [Address, `0x${string}`, bigint, boolean];
        if (bidder.toLowerCase() === address.toLowerCase()) { handle = encryptedAmount as string; break; }
        if (i === 0n) break;
      }
      if (!handle) { window.alert('No Bid Yet'); return; }

      const signer = await signerPromise!;
      const keypair = zama.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contracts = [SAFEBID_ADDRESS];
      const eip712 = zama.createEIP712(keypair.publicKey, contracts, startTimeStamp, durationDays);
      const signature = await signer.signTypedData(eip712.domain, { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification }, eip712.message);
      const pairs = [{ handle, contractAddress: SAFEBID_ADDRESS }];
      const res = await zama.userDecrypt(pairs, keypair.privateKey, keypair.publicKey, signature.replace('0x',''), contracts, signer.address, startTimeStamp, durationDays);
      const raw = res[handle];
      const SCALE = 1e9;
      const eth = (Number(raw) / SCALE).toString();
      setLast(eth);
      window.alert(`Your Bid: ${eth} ETH`);
    } catch (e:any) {
      console.error(e);
      window.alert(e?.message || 'Decrypt failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={onClick} disabled={busy || !address} style={{ padding: '6px 10px' }}>
      {busy ? 'Decrypting...' : (last ? `My Bid: ${last} ETH` : 'Decrypt My Bid')}
    </button>
  );
}
