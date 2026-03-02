// data.js — GPU Cache Coherency Demo

// Architecture definitions, block metadata, instruction reference

var BLOCK_INFO = {
  regs:      { name:'Register File', color:'#a8b0d0', desc:'Fastest storage on the chip. Each thread gets its own private registers — no sharing, no coherency needed. 32-bit per lane, ~255 per thread.', chips:[{t:'~1 cycle',c:'#51cf66'},{t:'private',c:'#339af0'}], connects:[{to:'l1',arrow:'→',why:'Spill registers to L1 when exhausted (register spilling)'},{to:'smem',arrow:'↔',why:'Threads read/write shared mem via LDS/STS instructions'}] },
  l1:        { name:'L1 Cache (unified)', color:'#ff6b6b', desc:'Per-SM cache. Pascal: read-only for global data — zero coherency overhead. Volta+: caches writes too, requires invalidation protocol when another SM writes to the same address.', chips:[{t:'~28 cycles',c:'#ffa94d'},{t:'per-SM',c:'#339af0'}], connects:[{to:'bus',arrow:'→',why:'Miss → sends RdReq or INV across coherency bus'},{to:'smem',arrow:'↔',why:'Shares physical SRAM pool (Volta+); split is software-configurable'},{to:'regs',arrow:'←',why:'Fills data into thread registers on cache hit/fill'}] },
  texCache:  { name:'Texture Cache (TEX$)', color:'#e599f7', desc:'Separate read-only cache optimized for 2D spatial locality. Used for sampled textures. Pascal keeps this distinct from L1; Volta+ merged them.', chips:[{t:'read-only',c:'#e599f7'},{t:'~24KB',c:'#a0a0a0'}], connects:[{to:'l2',arrow:'→',why:'All misses fetch from L2'},{to:'regs',arrow:'←',why:'Filtered/sampled results go into registers'}] },
  smem:      { name:'Shared Memory (SMEM)', color:'#51cf66', desc:'Software-managed on-chip SRAM. Threads in the same CTA (thread block) share this scratchpad. No coherency protocol — programmer controls all reads/writes explicitly. 32 memory banks.', chips:[{t:'~20 cycles',c:'#51cf66'},{t:'per-CTA',c:'#339af0'},{t:'no coherency',c:'#f06595'}], connects:[{to:'regs',arrow:'↔',why:'LDS/STS instructions move data between threads and SMEM'},{to:'l1',arrow:'↔',why:'Shares the same physical SRAM as L1 (Volta+), split is configurable'},{to:'async',arrow:'←',why:'cp.async loads data from global memory directly into SMEM (Ampere+)'}] },
  tma:       { name:'Tensor Memory Accelerator (TMA)', color:'#22d3ee', desc:'Hopper hardware DMA engine. Handles bulk multi-dimensional tensor transfers between global memory and SMEM. Offloads address calculation from threads, freeing them for compute.', chips:[{t:'NEW: Hopper',c:'#22d3ee'},{t:'hardware DMA',c:'#845ef7'}], connects:[{to:'smem',arrow:'→',why:'Deposits tensor tiles directly into SMEM with tensor-aware addressing'},{to:'globalMem',arrow:'←',why:'Reads from global memory with N-D tensor coordinate logic'}] },
  dsmem:     { name:'Distributed Shared Memory (DSMEM)', color:'#22d3ee', desc:'Hopper feature. SMs within the same Thread Block Cluster can directly read each other\'s shared memory — at roughly SMEM latency — without going through L2. Enables tighter SM cooperation.', chips:[{t:'NEW: Hopper',c:'#22d3ee'},{t:'cluster-scope',c:'#845ef7'},{t:'~20 cycles',c:'#51cf66'}], connects:[{to:'smem',arrow:'↔',why:'DSMEM is a window into another SM\'s SMEM within the cluster'},{to:'bus',arrow:'↔',why:'Cluster bus carries cross-SM DSMEM traffic'}] },
  async:     { name:'Async Copy (cp.async)', color:'#22d3ee', desc:'Ampere+ instruction that moves data from global to shared memory without occupying registers or stalling the warp. Like a mini-DMA per thread, enabling compute-memory overlap.', chips:[{t:'Ampere+',c:'#ffa94d'},{t:'bypass regs',c:'#51cf66'}], connects:[{to:'smem',arrow:'→',why:'Destination: deposits data directly into SMEM'},{to:'globalMem',arrow:'←',why:'Source: reads from global memory without touching registers'}] },
  bus:       { name:'Coherency Bus / Crossbar', color:'#f06595', desc:'The shared interconnect between all SMs and the L2. Carries read requests, data responses, and invalidation messages. Pascal uses a simple crossbar (L1 is read-only). Volta+ must broadcast INV messages when writes occur.', chips:[{t:'shared fabric',c:'#f06595'},{t:'broadcast INV',c:'#339af0'}], connects:[{to:'l1',arrow:'↔',why:'Delivers RdReq/DATA/INV messages to each SM\'s L1'},{to:'l2',arrow:'↔',why:'Connects all SMs to the shared L2 cache'}] },
  l2:        { name:'L2 Cache (unified)', color:'#ffa94d', desc:'Shared by all SMs — the point of coherence. All cache lines must pass through L2. Ampere introduced 10× larger L2 (40 MB) with software-controlled persistence windows. Hopper: 50 MB.', chips:[{t:'~200 cycles',c:'#ffa94d'},{t:'unified',c:'#339af0'},{t:'coherence point',c:'#f06595'}], connects:[{to:'bus',arrow:'↔',why:'Serves read/write requests from all SMs via the coherency bus'},{to:'globalMem',arrow:'↔',why:'Evicts dirty lines down to DRAM; fetches missing lines up on miss'}] },
  l2Persist: { name:'L2 Persistence Window', color:'#ffa94d', desc:'Ampere+ feature. You can pin a set of addresses to always stay in L2. Useful for weights or lookup tables accessed repeatedly across many kernels. Set via cudaAccessPolicyWindow.', chips:[{t:'Ampere+',c:'#ffa94d'},{t:'software ctrl',c:'#51cf66'}], connects:[{to:'l2',arrow:'↔',why:'A sub-region of the L2 pinned via CUDA API policy'},{to:'globalMem',arrow:'←',why:'Persistently caches frequently-read global data in L2'}] },
  globalMem: { name:'Global Memory Interface', color:'#339af0', desc:'The on-chip logic (memory controllers + NoC) that bridges L2 to physical DRAM. Handles address translation, ECC, and row/bank scheduling. Multiple controllers run in parallel for bandwidth.', chips:[{t:'memory ctrl',c:'#339af0'},{t:'multi-channel',c:'#845ef7'}], connects:[{to:'l2',arrow:'↔',why:'Receives evictions from L2; returns fetched DRAM data to L2'},{to:'hbm',arrow:'↔',why:'Issues actual read/write commands to HBM stacks'}] },
  hbm:       { name:'HBM / GDDR (DRAM)', color:'#845ef7', desc:'Off-chip high-bandwidth memory. HBM stacks dies vertically connected via micro-bumps. Hopper HBM3 = 3.35 TB/s. Slowest in the hierarchy but largest — all GPU memory ultimately lives here.', chips:[{t:'~400 cycles',c:'#ff6b6b'},{t:'off-chip',c:'#845ef7'},{t:'largest',c:'#6b7094'}], connects:[{to:'globalMem',arrow:'↔',why:'Memory controllers read/write HBM banks via wide parallel buses'}] },
  arbiter: {
    name: 'Atomic Arbiter',
    color: '#f59e0b',
    desc: 'Hardware serialization unit for atomic operations.',
    descHTML: `
<div class="arb-section">
  <div class="arb-section-title">What it does</div>
  <div class="arb-note">Every <code>atomicAdd</code>, <code>atomicCAS</code>, <code>atomicExch</code> passes through this block. Without it, multiple SMs race to L2 simultaneously and corrupt each other's read-modify-write — the lost-update bug. The arbiter serializes all atomics to the same address with zero programmer effort.</div>
</div>

<div class="arb-section">
  <div class="arb-section-title">Full pipeline</div>
  <div class="arb-pipeline">
    <span class="arb-step amber">ATOM</span><span class="arb-arrow">→</span>
    <span class="arb-step amber">interface</span><span class="arb-arrow">→</span>
    <span class="arb-step amber">SEQ# + queue</span><span class="arb-arrow">→</span>
    <span class="arb-step green">GRANT→SM</span><span class="arb-arrow">→</span>
    <span class="arb-step blue">RMW through arbiter→L2</span><span class="arb-arrow">→</span>
    <span class="arb-step orange">ACK#N←L2</span><span class="arb-arrow">→</span>
    <span class="arb-step purple">ROB retire</span><span class="arb-arrow">→</span>
    <span class="arb-step green">DATA→SM</span>
  </div>
</div>

<hr class="arb-divider">

<div class="arb-section">
  <div class="arb-section-title amber">① Bus interface + back-pressure</div>
  <div class="arb-row">
    <span class="arb-row-label">What:</span>
    <span class="arb-row-val">The single entry point between the coherency bus and the arbiter. All ATOM particles arrive here first. This is where back-pressure manifests — if the queue is full (6 slots), the particle stalls <em>at this line</em> and retries until space opens. The SM warp is stalled for that entire duration.</span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">Why a line:</span>
    <span class="arb-row-val">The interface is a distinct named boundary, not a bus segment. It represents the hardware FIFO entry gate — one logical point, not a block.</span>
  </div>
</div>

<div class="arb-section">
  <div class="arb-section-title amber">② SEQ# tagging + queue</div>
  <div class="arb-row">
    <span class="arb-row-label">What:</span>
    <span class="arb-row-val">On admission, each ATOM gets a monotonically increasing sequence number — <span class="arb-tag amber">SEQ#0</span>, <span class="arb-tag amber">SEQ#1</span>, … assigned strictly in arrival order. Simultaneously, a slot is reserved in both the Incoming Queue (left) and the Hold Buffer/ROB (right).</span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">Why:</span>
    <span class="arb-row-val">L2 banks complete out of order. Without a SEQ# the arbiter can't match a returning ACK to the right SM. The number travels with the request all the way to L2 and back — it's the ordering anchor for the ROB.</span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">Capacity:</span>
    <span class="arb-row-val"><strong>6 in-flight ops maximum.</strong> Queue and ROB both have 6 slots. Arrivals beyond 6 stall at the interface until a slot frees.</span>
  </div>
</div>

<div class="arb-section">
  <div class="arb-section-title green">③ GRANT (control signal only)</div>
  <div class="arb-row">
    <span class="arb-row-label">What:</span>
    <span class="arb-row-val">The arbiter pops the front-of-queue entry and sends a <span class="arb-tag green">GRANT</span> back to that SM's warp scheduler. This is a <em>control signal</em>, not data — it travels only to the bus junction (warp scheduler), not all the way to L1. The SM holds the atomic operand in a register already.</span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">Policy:</span>
    <span class="arb-row-val"><strong>FIFO arrival order.</strong> The SM that arrived first gets granted first. The arbiter issues grants back-to-back as fast as requests arrive — multiple RMWs can be in-flight through the arbiter simultaneously. Mutual exclusion on the cache line lives at L2, not here.</span>
  </div>
</div>

<div class="arb-section">
  <div class="arb-section-title blue">④ RMW through arbiter → L2</div>
  <div class="arb-row">
    <span class="arb-row-label">Path:</span>
    <span class="arb-row-val">SM bus junction → bus → arbiter top (enters block) → arbiter bottom (exits block) → L2. The particle physically traverses the arbiter block. The arbiter is a pass-through for ordering and sequencing — the actual atomic lock is held by L2 on the cache line.</span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">At L2:</span>
    <span class="arb-row-val">L2 performs Read-Modify-Write atomically in one locked step: read old value → apply op → write new value. <strong>~200 cycles</strong> round-trip. This is why atomics are expensive — full L2 latency, serialized.</span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">Jitter:</span>
    <span class="arb-row-val">Different L2 banks take different amounts of time. A random per-op latency (0–500ms visual) models this — it's what causes ACKs to return out of order, making the ROB actually do work.</span>
  </div>
</div>

<div class="arb-section">
  <div class="arb-section-title orange">⑤ ACK ← L2 (out of order)</div>
  <div class="arb-row">
    <span class="arb-row-label">What:</span>
    <span class="arb-row-val">L2 sends <span class="arb-tag orange">ACK#N</span> back to the arbiter bottom carrying the result value and original SEQ# tag. Because multiple RMWs are in-flight simultaneously, <span class="arb-tag orange">ACK#2</span> may arrive before <span class="arb-tag orange">ACK#0</span>. The SEQ# is the only way to know which result belongs to which SM.</span>
  </div>
</div>

<div class="arb-section">
  <div class="arb-section-title purple">⑥ Hold Buffer (ROB) — the reordering</div>
  <div class="arb-row">
    <span class="arb-row-label">What:</span>
    <span class="arb-row-val">Reorder Buffer with 6 slots, one per in-flight op, allocated at enqueue time in SEQ order. The ROB head always points to the lowest unretired SEQ#. Retirement only proceeds from the head.</span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">States per slot:</span>
    <span class="arb-row-val">
      <span class="arb-tag amber">⏳ pending</span> — RMW dispatched, ACK not back yet<br>
      <span class="arb-tag blue">✦ complete</span> — ACK received, result in hand — but blocked behind earlier pending slots<br>
      <span class="arb-tag green">✓ done</span> — head-of-line, DATA being sent to SM, slot cleaning up
    </span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">Example:</span>
    <span class="arb-row-val">SEQ#2 finishes before SEQ#0. ROB slot 2 flips to <span class="arb-tag blue">✦ complete</span> but cannot retire — slot 0 is still <span class="arb-tag amber">⏳ pending</span>. When SEQ#0 finally arrives: slot 0 retires → slot 1 checked → slot 2 checked → cascade drain in one pass. All three DATA packets leave in order 0, 1, 2.</span>
  </div>
  <div class="arb-row">
    <span class="arb-row-label">Why order?</span>
    <span class="arb-row-val">Each SM expects its own old value back — not another SM's result. Out-of-order delivery would give SM1 SM3's pre-op value. The ROB guarantees every SM gets exactly the result of its own atomic, in the correct order.</span>
  </div>
</div>

<hr class="arb-divider">
<div class="arb-note">Without this arbiter, atomics serialize inside L2 invisibly — you get correctness but zero visibility into latency, back-pressure, or reordering. The interface line, queue, and ROB are all implicit in real silicon. Apex makes every stage explicit.</div>`,
    chips: [{t:'NEW: Apex',c:'#f59e0b'},{t:'seq-numbered',c:'#339af0'},{t:'ROB ordered',c:'#51cf66'}],
    connects: [
      {to:'bus',   arrow:'←', why:'Receives all atomic requests from SMs via the coherency bus'},
      {to:'l2',    arrow:'→', why:'Dispatches one granted atomic at a time down to L2 for RMW'},
      {to:'l2',    arrow:'←', why:'Receives ACK with result value back from L2 (possibly out of order)'},
      {to:'bus',   arrow:'→', why:'Returns DATA to originating SM after ROB retires in SEQ order'}
    ]
  },
  cohDir:    { name:'Coherency Directory', color:'#22d3ee', desc:'A hardware table tracking which SMs hold a copy of each cache line. When a write occurs, instead of broadcasting INV to all SMs (O(n) traffic), the directory sends INV only to the SMs listed as sharers — O(sharers). At 256+ SMs this is a massive bus bandwidth saving. CPUs have used directories for decades; GPUs are still mostly broadcast-based.', chips:[{t:'NEW: Apex',c:'#22d3ee'},{t:'targeted INV',c:'#f06595'},{t:'O(sharers)',c:'#51cf66'}], connects:[{to:'l2',arrow:'↔',why:'Directory lives alongside L2 — each L2 set has an associated sharer vector'},{to:'bus',arrow:'→',why:'Sends targeted INV only to SMs in the sharer list'}] },
  warpScheduler:{ name:'Warp Scheduler', color:'#a78bfa', desc:'The SM sub-unit that decides which warp runs each clock cycle. When a warp stalls (waiting for L2 data, a dependency, or a barrier), the scheduler instantly switches to another ready warp. With enough resident warps, the stall is completely hidden by useful work from other warps — this is GPU latency tolerance. In Apex this becomes an explicit visible block with per-warp stall reason tracking.', chips:[{t:'NEW: Apex',c:'#a78bfa'},{t:'per-SM',c:'#339af0'},{t:'latency hiding',c:'#51cf66'}], connects:[{to:'l1',arrow:'↔',why:'When a warp misses L1, scheduler marks it stalled; when DATA arrives, marks it ready'},{to:'regs',arrow:'↔',why:'Stalled warp context (registers, PC) is swapped out when another warp runs'}] },
};

var INSTRUCTION_INFO = {
  'LD.E':   { name:'LD.E  (global load)', color:'#ff6b6b',
    what:'Load from global memory into registers. The .E suffix = "extended addressing" (64-bit). Each thread in the warp loads from its own address — if addresses are contiguous the hardware coalesces them into one wide transaction.',
    why:'You need this any time you read from a __device__ pointer or cudaMalloc\'d buffer. It\'s the bread-and-butter read path for all GPGPU work — matrix rows, activation tensors, weight arrays, etc.' },
  'ST.E':   { name:'ST.E  (global store)', color:'#51cf66',
    what:'Store from registers to global memory. On Pascal, bypasses L1 entirely (write-through). On Volta+ it evicts the L1 line and writes to L2 (write-evict), then broadcasts INV to other SMs.',
    why:'Writing results back to global memory after a kernel computation — output matrices, reduction results, feature maps. Write-evict keeps coherency cheap: only one SM "owns" a dirty line at a time.' },
  'LDS':    { name:'LDS  (load from shared)', color:'#51cf66',
    what:'Load from shared memory (SMEM) into registers. ~20 cycles — far cheaper than global. Hardware checks 32 memory banks; accesses to the same bank by different threads in a warp are serialised (bank conflict).',
    why:'The classic CUDA optimization: load a tile from global into SMEM once, then all threads reuse it from LDS repeatedly. MatMul tiling, stencil kernels, and reductions all rely on this.' },
  'STS':    { name:'STS  (store to shared)', color:'#51cf66',
    what:'Store from registers to shared memory. Same 32-bank structure as LDS. Used to cooperatively build a shared tile that other threads in the block will then read via LDS.',
    why:'Tiling patterns: one thread loads from global, stores into SMEM with STS, then all threads read with LDS. Also used for warp-level reductions — each thread stores its partial sum then reads neighbours.' },
  'ST.S':   { name:'ST.S  (store to shared, alt form)', color:'#51cf66',
    what:'Alternate encoding for shared memory store. Functionally equivalent to STS — same 20-cycle latency, same 32-bank conflict rules.',
    why:'Same use cases as STS — cooperative data staging, tiling, reductions. The assembler may emit either form.' },
  'RdReq':  { name:'RdReq  (read request packet)', color:'#ff6b6b',
    what:'Not an ISA instruction — a cache coherency protocol message sent from an SM\'s L1 to the L2 on a cache miss. Carries the missed cache line address. The L2 either serves it or forwards it to DRAM.',
    why:'Every L1 cache miss generates one. High miss rates flood the coherency bus and stall warps waiting for data — the root cause of memory-bound kernel performance.' },
  'INV':    { name:'INV  (invalidation message)', color:'#f06595',
    what:'Coherency protocol message broadcast from the L2 to all SMs after a write. Any SM holding a Shared or Modified copy of the written cache line must drop it (set to Invalid). Happens on every write in Volta+ write-evict policy.',
    why:'Essential for correctness in multi-SM workloads sharing the same address. Without invalidation, SM 0 could read a stale cached copy of data that SM 1 just wrote. The cost is bus bandwidth — atomic-heavy kernels saturate the bus with INVs.' },
  'DATA':   { name:'DATA  (cache line fill)', color:'#ffa94d',
    what:'The response to an RdReq — the actual 128-byte cache line payload travelling back from L2 (or DRAM) to the requesting SM\'s L1. On arrival, the L1 fills the line and transitions its state to Shared.',
    why:'This latency is what the GPU hides with warp switching (latency tolerance). If a warp stalls on DATA, the scheduler immediately runs another ready warp. More resident warps = more latency hiding.' },
  'WR':     { name:'WR  (write request)', color:'#51cf66',
    what:'Cache-level write packet flowing from L1 down to L2 on a write-evict event, or from L2 down to the memory controller. Carries both the address and dirty data payload.',
    why:'Part of the write-evict chain: thread writes to L1 → L1 drops the dirty line → WR packet carries it to L2. If L2 is also full, another WR goes all the way to DRAM. Write-heavy kernels generate a constant stream of these.' },
  'RMW':    { name:'RMW  (read-modify-write)', color:'#f59e0b',
    what:'The atomic read-modify-write operation dispatched by the Apex Arbiter to L2 after serialisation. The arbiter has already granted exclusive access; this packet carries the operation type (e.g. ADD), operand, and SEQ# to the L2 slice, which performs the read, applies the operation, and writes the result atomically.',
    why:'By the time you see RMW, the hard work is already done — the arbiter serialised competing requests so L2 never sees two RMWs to the same address simultaneously. Without the arbiter, two ATOMs reaching L2 at the same time would corrupt each other\'s result silently.' },
  'WB':     { name:'WB  (write-back)', color:'#ffa94d',
    what:'Write-Back — a dirty L1 line is being evicted and its contents written back to L2. Different from a regular write in that it\'s triggered by cache capacity pressure, not the thread actively storing. Carries Modified → Shared state transition.',
    why:'Happens automatically when the L1 is full and a new line must enter. Frequent write-backs indicate working sets larger than L1 — a sign you should either reduce data reuse distances or tune the SMEM/L1 split.' },
  'EVICT':  { name:'EVICT  (L2 victim eviction)', color:'#339af0',
    what:'An L2 cache line is being evicted to DRAM because L2 is full. The victim line (chosen by LRU policy) travels through the NoC to the memory controller. Ampere\'s persistence window lets you protect chosen lines from eviction.',
    why:'L2 evictions to DRAM are slow (~400+ cycles). If your kernel constantly evicts from L2 it\'s DRAM-bandwidth-bound. Ampere\'s cudaAccessPolicyWindow lets you pin hot data (e.g., a weight matrix) to resist eviction.' },
  'STORE':  { name:'STORE  (DRAM write)', color:'#845ef7',
    what:'The final write command issued from a memory controller to an HBM/GDDR bank. At this point data leaves the on-chip world entirely. Row-activation (tRCD), column write (tCL), and precharge (tRP) timing all apply.',
    why:'DRAM writes are the slowest path in the hierarchy. You want kernels to rarely reach here — maximize L2 residency and use cp.async or TMA to overlap DRAM reads with compute rather than blocking on them.' },
  'DSMEM':  { name:'DSMEM  (distributed shared memory)', color:'#22d3ee',
    what:'Hopper-only packet. An SM reads from another SM\'s shared memory within the same Thread Block Cluster. The request travels the cluster bus — but stays entirely on-chip, never touching L2 or DRAM. ~20 cycle latency.',
    why:'Enables sub-L2 communication between cooperating SMs: e.g., overlapping tiles in FlashAttention-style kernels, or producer-consumer pipelines where one SM generates data another immediately consumes.' },
  'cp.async':{ name:'cp.async  (async global→shared copy)', color:'#22d3ee',
    what:'Ampere instruction. Initiates a DMA-style transfer from global memory directly into SMEM — without allocating registers, without stalling the issuing warp. Multiple cp.async loads can be in flight simultaneously.',
    why:'The key to software pipelining (double-buffering) on Ampere+: issue cp.async for tile N+1 while computing on tile N. Completely hides DRAM latency. Critical for reaching peak FLOPS on matrix multiply kernels.' },
  'ATOM':   { name:'ATOM  (atomic request)', color:'#f59e0b',
    what:'An atomic operation packet (e.g. atomicAdd) leaving an SM and entering the Apex Arbiter. Carries: the target address, the operation type (ADD/CAS/MIN/MAX), the operand value, and the SM source ID. The arbiter stamps a SEQ# on it immediately.',
    why:'Atomics are the only safe way for concurrent threads to update shared memory without races. The cost is serialization — all atomics to the same address queue through the arbiter one at a time. See the atomicAdd scenario to watch this unfold.' },
  'GRANT':  { name:'GRANT  (arbiter grant signal)', color:'#51cf66',
    what:'Apex Arbiter signal sent back to the SM whose ATOM request just reached the front of the queue. Tells the SM: "you now have exclusive access to this cache line — proceed with the read-modify-write." The L2 cache line is locked until ACK is received.',
    why:'The grant/ack protocol prevents two SMs from simultaneously modifying the same address. Without it, atomicAdd would not be atomic — two SMs could both read the value, both add to it, and one result would be silently lost.' },
  'ACK':    { name:'ACK  (atomic acknowledgement)', color:'#f59e0b',
    what:'Returned by L2 to the Arbiter after the atomic read-modify-write is complete. The arbiter logs this in the ROB under the original SEQ#, marks the slot done, and notifies the originating SM that the operation finished.',
    why:'The ACK closes the transaction loop. Until the arbiter receives ACK, the next SM in the queue cannot be granted access to that cache line address. High atomic contention means long chains of GRANT → op → ACK cycles.' },
  'SEQ':    { name:'SEQ#  (sequence number)', color:'#fbbf24',
    what:'A monotonically incrementing transaction ID stamped by the Apex Arbiter on every incoming ATOM request. Travels with the request all the way to L2 and back. The ROB uses it to match returning ACKs to the correct waiting SM.',
    why:'Without sequence numbers, returning data has no way to identify which SM asked for it — especially when L2 bank conflicts cause some atomics to complete before earlier-numbered ones. The ROB uses SEQ# to restore order before retiring.' },
  'SPILL':  { name:'SPILL  (register spill to L1)', color:'#fb923c',
    what:'A thread\'s live registers exceed the physical register file. The compiler spills excess values to L1 cache (and if L1 is full, the spill cascades to L2). The warp stalls until the spill completes.',
    why:'High occupancy (many threads per SM) reduces registers per thread, increasing spill risk. Spills consume L1 bandwidth and add ~28 cycles on L1 hit, ~200 cycles on L2 hit. Minimise by reducing thread count or splitting large kernels.' },
  'RELOAD': { name:'RELOAD  (register reload from L1/L2)', color:'#fb923c',
    what:'The compiler reloads a previously-spilled register value from L1 (or L2 on a miss) just before it is needed again. Shows as a load from the cache back into the register file.',
    why:'Every RELOAD is a stall on the critical path. If all resident warps are spilling simultaneously, there are no other warps to switch to and the SM stalls completely. Visible as "register-limited" in CUDA occupancy calculators.' },
  'TILE':   { name:'TILE  (TMA bulk tile transfer)', color:'#22d3ee',
    what:'A multi-dimensional tensor tile transferred by the Tensor Memory Accelerator. The TMA engine handles all address arithmetic and issues the DMA autonomously — zero thread registers consumed, warp continues computing immediately.',
    why:'TMA enables true compute-memory overlap on Hopper: issue one TILE descriptor, compute on the previous tile, and the next tile arrives in SMEM for free. Critical for persistent kernels, FlashAttention, and any pipeline feeding WGMMA.' },
};

var ARCHS = {
  pascal: {
    name:'Pascal', gen:'SM 6.1', year:2016, color:'#51cf66', example:'GTX 1080 Ti',
    smLabel:'SM',
    intro:"The last generation before unified L1. Pascal keeps things simple — L1 is read-only for global memory, so there's zero coherency overhead at L1. Writes go straight to L2. Great for understanding the baseline before things got complex.",
      delta:"<strong>vs baseline:</strong> This is the reference point — read-only L1, no coherency, writes bypass L1 entirely.",
    perf:{ smCount:28, l1Size:24, smemSize:96, l2Size:4096, bw:484, flops:11.3, memType:'GDDR5X', vram:11, tdp:250, l1Latency:28, l2Latency:200, dramLatency:400 },
    blocks:{
      l1:{ label:'L1 (24KB)', desc:'Read-only texture/data cache. NOT coherent with global stores.', state:true },
      texCache:{ label:'TEX$', desc:'Separate texture cache, read-only, ~24KB.' },
      sharedMem:{ label:'SMEM (48–96KB)', desc:'Separate physical SRAM from L1. Configurable split.', state:false },
      l2:{ label:'L2 Cache (3–4MB)', desc:'Unified, coherent. Point of coherence for all SMs.', size:'3–4MB' },
      coherencyBus:{ label:'Crossbar', desc:'Simple crossbar — minimal coherency traffic since L1 is read-only.' },
      globalMem:{ label:'Global Memory', desc:'GDDR5/GDDR5X memory interface.' },
      hbm:{ label:'GDDR5X', desc:'High-speed GDDR, ~480 GB/s on 1080 Ti.' },
    },
    writePolicy:'Write-through (L1 is read-only for globals)',
    coherency:'None at L1 — L2 is sole coherence point',
    keyChange:null,
  },
  volta: {
    name:'Volta', gen:'SM 7.0', year:2017, color:'#339af0', example:'V100',
    smLabel:'SM',
    intro:"The big unification. Volta merged L1 and texture cache into a single 128KB SRAM that's also shared with SMEM. L1 now caches global writes too, which means coherency actually matters — enter write-evict and invalidation.",
      delta:"<strong>vs Pascal:</strong> L1 now caches writes. That means a dirty line in SM0 must be invalidated in SM1 — the first time GPUs needed a real coherency protocol. Cost: every write triggers an INV broadcast to all SMs.",
    perf:{ smCount:80, l1Size:128, smemSize:96, l2Size:6144, bw:900, flops:15.7, memType:'HBM2', vram:32, tdp:300, l1Latency:28, l2Latency:193, dramLatency:370 },
    blocks:{
      l1:{ label:'L1 + TEX (unified, 128KB)', desc:'L1 and texture cache merged.', state:true, changed:true },
      texCache:null,
      sharedMem:{ label:'SMEM (up to 96KB)', desc:'Shares the 128KB SRAM pool with L1.', changed:true },
      l2:{ label:'L2 Cache (6MB)', desc:'Larger L2. Write-evict policy from L1.', size:'6MB', changed:true },
      coherencyBus:{ label:'Coherency Bus', desc:'Now carries invalidation messages.' },
      globalMem:{ label:'Global Memory', desc:'HBM2 interface. 4 stacks.' },
      hbm:{ label:'HBM2', desc:'900 GB/s. Stacked DRAM.', changed:true },
    },
    writePolicy:'Write-evict (dirty L1 line dropped, write goes to L2)',
    coherency:'L1 invalidation via bus, L2 is coherence point',
    keyChange:'L1 + TEX unified, shared SRAM pool with SMEM, HBM2',
  },
  ampere: {
    name:'Ampere', gen:'SM 8.0', year:2020, color:'#ffa94d', example:'A100',
    smLabel:'SM',
    intro:"Ampere's headline: 10× larger L2 (40MB!) with software-controlled persistence, and async copy (cp.async) that moves data from global to shared memory without burning registers.",
      delta:"<strong>vs Volta:</strong> L2 grew 10× to 40MB and you can now pin data to stay resident (persistence window). cp.async decouples memory loads from register pressure — overlapping compute and memory without stalling warps.",
    perf:{ smCount:108, l1Size:192, smemSize:164, l2Size:40960, bw:2039, flops:19.5, memType:'HBM2e', vram:80, tdp:400, l1Latency:33, l2Latency:200, dramLatency:400 },
    blocks:{
      l1:{ label:'L1 + TEX (192KB)', desc:'Larger unified L1/TEX cache.', state:true, changed:true },
      texCache:null,
      sharedMem:{ label:'SMEM (up to 164KB)', desc:'Larger SMEM. cp.async bypasses register file.', changed:true },
      asyncCopy:{ label:'ASYNC COPY', desc:'cp.async: DMA-like transfer from global to shared, bypassing registers.', isNew:true },
      l2:{ label:'L2 Cache (40MB)', desc:'Massive L2. Persistence controls via cudaAccessPolicyWindow.', size:'40MB', changed:true },
      l2Persist:{ label:'L2 PERSIST', desc:'Software-controlled L2 data persistence.', isNew:true },
      coherencyBus:{ label:'Coherency Bus', desc:'Same write-evict L1 coherency as Volta.' },
      globalMem:{ label:'Global Memory', desc:'HBM2e interface. 5 stacks.' },
      hbm:{ label:'HBM2e', desc:'2 TB/s. 80GB.', changed:true },
    },
    writePolicy:'Write-evict (same as Volta)',
    coherency:'L1 write-evict + invalidation, L2 persistence controls',
    keyChange:'Async copy (cp.async), 10× larger L2 with persistence',
  },
  hopper: {
    name:'Hopper', gen:'SM 9.0', year:2022, color:'#845ef7', example:'H100',
    smLabel:'SM',
    intro:"Hopper introduces TMA (Tensor Memory Accelerator) — a hardware DMA engine for complex tensor addressing — and DSMEM, where SMs in a cluster can directly read each other's shared memory.",
      delta:"<strong>vs Ampere:</strong> TMA offloads tensor address math from threads to hardware — freeing warps entirely during data movement. DSMEM lets SMs in a cluster share memory at SMEM latency (~20 cycles) rather than going through L2 (~200 cycles).",
    perf:{ smCount:132, l1Size:256, smemSize:228, l2Size:51200, bw:3352, flops:66.9, memType:'HBM3', vram:80, tdp:700, l1Latency:33, l2Latency:200, dramLatency:380 },
    blocks:{
      l1:{ label:'L1 + TEX (256KB)', desc:'Even larger unified cache with TMA support.', state:true, changed:true },
      texCache:null,
      sharedMem:{ label:'SMEM (up to 228KB)', desc:'Largest SMEM. DSMEM for cross-SM shared memory access.', changed:true },
      dsmem:{ label:'DSMEM', desc:'Distributed Shared Memory. SMs within a cluster can directly access each other\'s shared memory.', isNew:true },
      tma:{ label:'TMA', desc:'Tensor Memory Accelerator. Hardware DMA for bulk data transfers with tensor-aware addressing.', isNew:true },
      asyncCopy:{ label:'ASYNC COPY', desc:'Enhanced from Ampere with TMA integration.' },
      l2:{ label:'L2 Cache (50MB)', desc:'Larger still with improved persistence controls.', size:'50MB', changed:true },
      l2Persist:{ label:'L2 PERSIST', desc:'Refined from Ampere with better granularity.' },
      coherencyBus:{ label:'Cluster Bus', desc:'New cluster-level interconnect for DSMEM.', changed:true },
      globalMem:{ label:'Global Memory', desc:'HBM3 interface.' },
      hbm:{ label:'HBM3', desc:'3.35 TB/s. 80GB.', changed:true },
    },
    writePolicy:'Write-evict + TMA bulk transfers',
    coherency:'Cluster-level DSMEM coherency + L2 global coherence',
    keyChange:'TMA engine, Distributed Shared Memory (DSMEM), HBM3',
  },
  apex: {
    name:'Apex', gen:'SM 10.0', year:2026, color:'#f59e0b', example:'Concept',
    smLabel:'SM',
    intro:"A forward-looking architecture exploring three unsolved problems in GPU memory design. The headline addition: a hardware <strong>Atomic Arbiter</strong> with a visible request queue, sequence-numbered transactions, and a Reorder Buffer (ROB) to handle out-of-order returns. Also features a Coherency Directory replacing broadcast INV with targeted per-SM invalidation. None of these exist in shipping silicon yet — but the problems they solve are very real.",
      delta:"<strong>vs Hopper:</strong> Atomics were always a black box — requests raced into L2 and serialised invisibly. The Arbiter makes that visible: you see the queue fill, grants issue, RMWs fly, and the ROB reorder returns. The Coherency Directory eliminates the O(n) INV broadcast — only SMs that actually hold a copy get notified. Both ideas exist in CPU design but not yet in shipping GPU silicon.",
    perf:{ smCount:144, l1Size:320, smemSize:256, l2Size:65536, bw:5000, flops:120, memType:'HBM4', vram:192, tdp:1000, l1Latency:25, l2Latency:160, dramLatency:350 },
    blocks:{
      l1:{ label:'L1 + TEX (320KB)', desc:'Enlarged unified L1 with lower latency predictor logic.', state:true, changed:true },
      texCache:null,
      sharedMem:{ label:'SMEM (up to 256KB)', desc:'Larger SMEM with hardware bank-conflict detection.', changed:true },
      warpScheduler:{ label:'WARP SCHED', desc:'Explicit warp scheduler sub-unit. Tracks stall reasons per warp — memory, dependency, branch — and uses them to pick the best next warp to run. Makes latency hiding observable.', isNew:true },
      arbiter:{ label:'ATOMIC ARBITER', desc:'Hardware arbiter serializing atomic operations. Assigns a sequence number to every atomic request, queues up to 6 pending ops, and grants them FIFO (arrival order). A Reorder Buffer (ROB) holds returning data until it can be retired in order.', isNew:true },
      l2:{ label:'L2 Cache (64MB)', desc:'Larger L2 with per-address owner tracking for the coherency directory.', size:'64MB', changed:true },
      cohDir:{ label:'COHERENCY DIR', desc:'Directory replacing broadcast INV. Tracks which SMs hold a copy of each cache line. Writes only send INV to SMs that actually have a copy — O(sharers) instead of O(all SMs). Critical for scaling to 256+ SM counts.', isNew:true },
      coherencyBus:{ label:'Targeted Inval. Bus', desc:'Bus now carries targeted (not broadcast) INV messages. Only SMs listed in the directory receive INV — massive bandwidth saving at high SM counts.', changed:true },
      globalMem:{ label:'Global Memory', desc:'HBM4 interface. 8 stacks, 5 TB/s.' },
      hbm:{ label:'HBM4', desc:'5 TB/s. 192GB. Next-generation stacked DRAM.', changed:true },
    },
    writePolicy:'Write-evict + arbiter-serialized atomics',
    coherency:'Directory-based targeted INV + ROB-ordered atomic returns',
    keyChange:'Atomic Arbiter with ROB, Coherency Directory, Warp Scheduler',
  }
};

var currentArch = 'pascal';
var prevArch = null;
var stats = { hits:0, misses:0, inv:0, wb:0 };
var autoMode = true, autoTimer = 0;
var particles = [], flashEffects = [], stepTimers = [], bubbles = [];
var SPEED_SCALE = 0.55;  // global multiplier — all particle speeds divided by this; <1 = slower
var layout = {};

var NUM_LINES = 16;
var cacheState = [];
// L2 line state: 0=empty, 1=clean, 2=dirty (mirroring L1 convention)
// Shared across all SMs — L2 is unified. NUM_L2_LINES shown as occupancy bars.
var NUM_L2_LINES = 24;
var l2Lines = new Array(NUM_L2_LINES).fill(0);


