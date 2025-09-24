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
      <main style={{ maxWidth: '72rem', margin: '0 auto', padding: '2rem 1rem' }}>
        {!hasContract && (
          <div className="card card-padding" style={{ background: 'var(--warning-50)', color: 'var(--warning-600)', marginBottom: '1.5rem', border: '1px solid var(--warning-200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>⚠️</span>
              <strong>Contract Not Configured</strong>
            </div>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem' }}>Please deploy the contract and run <code>npm run sync:frontend</code>.</p>
          </div>
        )}
        <section className="card card-padding" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🎯</span>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-800)' }}>Create New Auction</h2>
          </div>
          <form onSubmit={onCreateAuction} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'end' }} className="responsive-form">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }} className="form-inputs">
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-700)', marginBottom: '0.5rem' }}>Item Name</label>
                <input className="input" placeholder="Enter item name" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--gray-700)', marginBottom: '0.5rem' }}>Start Price (ETH)</label>
                <input className="input" placeholder="0.1" type="number" step="0.001" value={priceEth} onChange={e => setPriceEth(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary mobile-button-full" type="submit" disabled={!hasContract || !address || !name || !priceEth}>
              <span style={{ marginRight: '0.5rem' }}>🚀</span>
              Create Auction
            </button>
          </form>
        </section>

        <section className="card card-padding">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🏆</span>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-800)' }}>Live Auctions</h2>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
              <span style={{ marginRight: '0.5rem' }}>{loading ? '⏳' : '🔄'}</span>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <div style={{ background: 'var(--primary-50)', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid var(--primary-200)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-700)' }}>
              <span style={{ fontSize: '1.25rem' }}>🔐</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>All bid prices are encrypted and remain confidential until auction ends</span>
            </div>
          </div>
          {auctions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--gray-500)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--gray-600)' }}>No Auctions Yet</h3>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>Create the first auction to get started!</p>
            </div>
          )}
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {auctions.map(a => {
              const isActive = a.active && !a.ended;
              const isMyAuction = address === a.seller;
              const canBid = isActive && !isMyAuction;

              return (
              <div key={a.id.toString()} className="card card-padding" style={{ position: 'relative', overflow: 'hidden' }}>
                {/* Status Banner */}
                <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
                  <span className={`badge ${
                    isActive ? 'badge-active' : a.ended ? 'badge-ended' : 'badge-pending'
                  }`}>
                    {isActive ? 'Live' : a.ended ? 'Ended' : 'Pending'}
                  </span>
                </div>

                {/* Auction Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>📦</span>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--gray-800)' }}>{a.itemName}</h3>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.875rem', color: 'var(--gray-600)' }} className="mobile-auction-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>👤</span>
                      <span><strong>Seller:</strong> {a.seller.slice(0, 6)}...{a.seller.slice(-4)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>💰</span>
                      <span><strong>Start Price:</strong> {formatEth(a.startPrice)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>🕐</span>
                      <span><strong>Started:</strong> {formatLocalTime(a.startTime)}</span>
                    </div>
                  </div>
                </div>
                {/* Timer */}
                <div style={{ background: isActive ? 'var(--success-50)' : 'var(--gray-50)', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', border: `1px solid ${isActive ? 'var(--success-200)' : 'var(--gray-200)'}` }}>
                  <TimerRow a={a} nowTs={nowTs} bidTimeout={bidTimeout} />
                </div>
                {/* Bidding Section */}
                {canBid && (
                  <div style={{ background: 'var(--primary-50)', padding: '1.5rem', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid var(--primary-200)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>🎯</span>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--primary-700)' }}>Place Your Bid</h4>
                    </div>
                    <BidBox
                      auctionId={a.id}
                      seller={a.seller}
                      onPlace={onPlaceBid}
                      disabled={
                        zamaLoading || !zama || !!zamaError
                      }
                    />
                  </div>
                )}

                {isMyAuction && isActive && (
                  <div style={{ background: 'var(--warning-50)', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', border: '1px solid var(--warning-200)', textAlign: 'center' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--warning-600)', fontWeight: 500 }}>👑 This is your auction</span>
                  </div>
                )}
                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }} className="mobile-button-group">
                  <button className="btn btn-secondary btn-sm" onClick={() => onCheckEnd(a.id)} disabled={!a.active || a.ended}>
                    <span style={{ marginRight: '0.5rem' }}>🔍</span>
                    Check End
                  </button>

                  <DecryptMyBidButton a={a} address={address} publicClient={publicClient} zama={zama} signerPromise={signerPromise} />

                  {isMyAuction && (
                    <>
                      <button className="btn btn-warning btn-sm" onClick={() => onEnd(a.id)} disabled={!a.active || a.ended}>
                        <span style={{ marginRight: '0.5rem' }}>🏁</span>
                        End Auction
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => onEmergency(a.id)} disabled={!a.active || a.ended}>
                        <span style={{ marginRight: '0.5rem' }}>🚨</span>
                        Emergency Stop
                      </button>
                    </>
                  )}

                  {!a.active && a.ended && address === a.winner && (
                    <button className="btn btn-success" onClick={() => onPurchase(a)}>
                      <span style={{ marginRight: '0.5rem' }}>✅</span>
                      Complete Purchase
                    </button>
                  )}
                </div>
                {/* Winner Display */}
                {!a.active && a.ended && (
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    background: a.winner !== '0x0000000000000000000000000000000000000000' ? 'var(--success-50)' : 'var(--gray-50)',
                    border: `1px solid ${a.winner !== '0x0000000000000000000000000000000000000000' ? 'var(--success-200)' : 'var(--gray-200)'}`,
                    borderRadius: '0.75rem',
                    textAlign: 'center'
                  }}>
                    {a.winner !== '0x0000000000000000000000000000000000000000' ? (
                      <div>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🏆</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--success-600)' }}>Winner: {a.winner.slice(0, 6)}...{a.winner.slice(-4)}</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>❌</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>No Winner</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function BidBox({ auctionId, seller, onPlace, disabled }: { auctionId: bigint; seller: Address; onPlace: (id: bigint, seller: Address, bidValue: string) => Promise<void>; disabled?: boolean }) {
  const [bid, setBid] = useState<string>('');
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }} className="bid-form">
      <div style={{ flex: 1 }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--primary-700)', marginBottom: '0.5rem' }}>
          Your Bid Amount
        </label>
        <input
          className="input"
          type="number"
          step="0.000000001"
          placeholder="Enter bid amount (max 4.294967295 ETH)"
          value={bid}
          onChange={e => setBid(e.target.value)}
          style={{ fontSize: '1rem' }}
        />
      </div>
      <button
        className="btn btn-primary"
        onClick={() => onPlace(auctionId, seller, bid)}
        disabled={disabled || !bid}
        style={{ minWidth: '140px' }}
      >
        <span style={{ marginRight: '0.5rem' }}>🚀</span>
        Place Bid
      </button>
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
  const isUrgent = endAt && endAt - now <= 300n && endAt > now; // Less than 5 minutes remaining

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: 600,
        color: isUrgent ? 'var(--error-600)' : a.active ? 'var(--success-600)' : 'var(--gray-600)'
      }}>
        <span style={{ fontSize: '1rem' }}>
          {a.active ? (isUrgent ? '⏰' : '🕒') : a.ended ? '✅' : '⏳'}
        </span>
        {label}
      </div>
      {endAt && (
        <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
          Ends at: {formatLocalTime(endAt)}
        </div>
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
    <button className="btn btn-secondary btn-sm" onClick={onClick} disabled={busy || !address}>
      <span style={{ marginRight: '0.5rem' }}>
        {busy ? '🔓' : (last ? '💰' : '🔐')}
      </span>
      {busy ? 'Decrypting...' : (last ? `My Bid: ${last} ETH` : 'Decrypt My Bid')}
    </button>
  );
}
