// ============================================================
// LEARN PAGE DATA  —  structured reference for the Learn tab
// ============================================================
const LEARN_SECTIONS = [
  {
    id: 'sva-operators',
    title: 'SVA Operator Quick Reference',
    icon: '⚙️',
    subsections: [
      {
        title: 'Temporal Delay Operators',
        content: `<table class="ltbl"><tr><th>Operator</th><th>Meaning</th><th>Example</th></tr>
<tr><td><code>##N</code></td><td>Exactly N clock cycles</td><td><code>req ##1 ack</code></td></tr>
<tr><td><code>##[M:N]</code></td><td>Between M and N cycles (inclusive)</td><td><code>req ##[1:4] ack</code></td></tr>
<tr><td><code>##[0:$]</code></td><td>Zero or more cycles (bounded by proof depth)</td><td><code>start ##[0:$] done</code></td></tr>
<tr><td><code>[*N]</code></td><td>Consecutive repetition exactly N times</td><td><code>valid [*4]</code></td></tr>
<tr><td><code>[*M:N]</code></td><td>Consecutive repetition M to N times</td><td><code>stall [*0:8]</code></td></tr>
<tr><td><code>[*]</code></td><td>Zero or more consecutive repetitions</td><td><code>idle [*]</code></td></tr>
<tr><td><code>[+]</code></td><td>One or more consecutive repetitions</td><td><code>busy [+]</code></td></tr>
<tr><td><code>[->N]</code></td><td>Non-consecutive (goto): true exactly N times, eventually</td><td><code>ack [->3]</code></td></tr>
<tr><td><code>[=N]</code></td><td>Non-consecutive: at least N times within sequence</td><td><code>grant [=2]</code></td></tr>
</table>`
      },
      {
        title: 'Implication Operators',
        content: `<table class="ltbl"><tr><th>Operator</th><th>Meaning</th><th>Equivalent</th></tr>
<tr><td><code>A |-&gt; B</code></td><td><strong>Overlapping</strong>: if A at cycle T, then B at same cycle T</td><td>—</td></tr>
<tr><td><code>A |=&gt; B</code></td><td><strong>Non-overlapping</strong>: if A at cycle T, then B at cycle T+1</td><td><code>A |-&gt; ##1 B</code></td></tr>
</table>
<div class="lnote">⚠️ Most common SVA bug: using <code>|-&gt;</code> instead of <code>|=&gt;</code> for registered outputs. Flip-flop outputs appear ONE cycle later — always use <code>|=&gt;</code> for registered relationships.</div>`
      },
      {
        title: 'Sequence Combination Operators',
        content: `<table class="ltbl"><tr><th>Operator</th><th>Meaning</th></tr>
<tr><td><code>s1 ##0 s2</code></td><td>s1 and s2 share the same end/start point</td></tr>
<tr><td><code>s1 and s2</code></td><td>Both match simultaneously; can end at different cycles</td></tr>
<tr><td><code>s1 intersect s2</code></td><td>Both match simultaneously AND must end at the same cycle</td></tr>
<tr><td><code>s1 or s2</code></td><td>Either sequence matches</td></tr>
<tr><td><code>s1 within s2</code></td><td>s1 completes entirely within the time span of s2</td></tr>
<tr><td><code>expr throughout s</code></td><td>expr must hold every cycle throughout s</td></tr>
<tr><td><code>first_match(s)</code></td><td>Only the earliest completion counts</td></tr>
</table>`
      },
      {
        title: 'Sampled-Value Functions',
        content: `<table class="ltbl"><tr><th>Function</th><th>True when…</th><th>At time 0</th></tr>
<tr><td><code>$rose(x)</code></td><td>LSB was 0 last cycle, is 1 this cycle</td><td>→ 0</td></tr>
<tr><td><code>$fell(x)</code></td><td>LSB was 1 last cycle, is 0 this cycle</td><td>→ 0</td></tr>
<tr><td><code>$stable(x)</code></td><td>Same value as last cycle</td><td>→ 1 ⚠️</td></tr>
<tr><td><code>$changed(x)</code></td><td>Different value than last cycle</td><td>→ 0</td></tr>
<tr><td><code>$past(x, N)</code></td><td>Value of x exactly N cycles ago</td><td>→ 0 for N &gt; elapsed</td></tr>
<tr><td><code>$sampled(x)</code></td><td>Preponed (stable) value at current clock edge</td><td>—</td></tr>
</table>
<div class="lnote">⚠️ All sampled-value functions are undefined at cycle 0 and can cause spurious passes at reset. Always use <code>disable iff (!rst_n)</code>.</div>`
      },
      {
        title: 'disable iff Semantics',
        content: `<div class="lpara"><code>disable iff (expr)</code> is <strong>asynchronous</strong> — property evaluation is abandoned immediately when the condition becomes true, not just at the next clock edge.</div>
<div class="lcode">// Correct — always use for resettable designs
assert property (@(posedge clk) disable iff (!rst_n)
  req |-> ##[1:8] ack);

// Async reset: if rst_n goes low mid-sequence (between clock edges),
// the in-flight evaluation is abandoned immediately.
// A synchronous model (|-> with reset in antecedent) only checks at clock edges
// and can miss brief async reset pulses.</div>`
      }
    ]
  },
  {
    id: 'jasper-apps',
    title: 'JasperGold App Suite',
    icon: '🔬',
    subsections: [
      {
        title: 'App Overview',
        content: `<table class="ltbl"><tr><th>App</th><th>What it checks</th><th>Phase</th></tr>
<tr><td><strong>FPV</strong> — Formal Property Verification</td><td>SVA assert/assume/cover properties against RTL</td><td>Functional</td></tr>
<tr><td><strong>Superlint</strong></td><td>Structural quality: latches, reset issues, dead states, combo loops</td><td>Structural (Phase 1)</td></tr>
<tr><td><strong>Coverage App (FCA)</strong></td><td>Formal reachability of line/branch/FSM/toggle/cover targets</td><td>Structural + Functional</td></tr>
<tr><td><strong>Connectivity App</strong></td><td>Prove/disprove signal paths between modules</td><td>Structural (Phase 1)</td></tr>
<tr><td><strong>CDC App</strong></td><td>Clock domain crossing analysis</td><td>Structural</td></tr>
<tr><td><strong>LP App</strong></td><td>UPF low-power: isolation cells, retention registers</td><td>Power</td></tr>
<tr><td><strong>Security Path</strong></td><td>Information flow, isolation, fault injection</td><td>Security</td></tr>
</table>`
      },
      {
        title: 'Superlint — What It Catches',
        content: `<div class="lpara">Superlint is a <strong>formal lint tool</strong> — it uses formal methods to find issues that pattern-matching linters (SpyGlass, Questa Lint) miss.</div>
<table class="ltbl"><tr><th>Check</th><th>What it finds</th></tr>
<tr><td>Latch detection</td><td>Unintentional level-sensitive latches from incomplete if/case</td></tr>
<tr><td>Reset completeness</td><td>Flip-flops that can never be initialised from the reset state</td></tr>
<tr><td>Unreachable FSM states</td><td>States that can never be entered from reset under any input</td></tr>
<tr><td>Combinational loops</td><td>Combinational feedback paths not through FFs</td></tr>
<tr><td>X-propagation</td><td>Paths where X can propagate to outputs</td></tr>
<tr><td>Arithmetic overflow</td><td>Counter/bus overflow conditions</td></tr>
</table>
<div class="lnote">✅ Always run Superlint before writing FPV properties. Structural bugs corrupt functional proofs.</div>`
      },
      {
        title: 'Coverage App — Result Meanings',
        content: `<table class="ltbl"><tr><th>Result</th><th>Meaning</th><th>Action</th></tr>
<tr><td>✅ <strong>Covered</strong></td><td>Formal witness found — provably reachable</td><td>Export witness as simulation seed</td></tr>
<tr><td>❌ <strong>Unreachable</strong></td><td>Formally proven impossible under all valid stimuli</td><td>Waive with justification or fix RTL</td></tr>
<tr><td>⏳ <strong>Undetermined</strong></td><td>Analysis incomplete (bounded/timeout)</td><td>Increase depth, add abstraction, rerun</td></tr>
</table>
<div class="lnote">💡 <strong>Unreachable is a PROOF, not a simulation gap.</strong> No input sequence, ever, can reach that code. Far stronger than simulation showing 0% on a target.</div>`
      },
      {
        title: 'Connectivity App',
        content: `<div class="lpara">Formally verifies signal paths between modules — can prove both <strong>reachability</strong> (path exists) and <strong>isolation</strong> (path does NOT exist).</div>
<ul class="llist">
<li><strong>Security isolation</strong>: prove a DMA cannot reach a secure memory region's data lines</li>
<li><strong>Interface compliance</strong>: prove all required signals connect correctly between IP blocks</li>
<li><strong>Address map verification</strong>: each address decodes to exactly one target</li>
<li><strong>Clock/reset routing</strong>: clocks and resets reach intended flip-flops</li>
</ul>
<div class="lpara">Input: CSV or Hjson file specifying source→destination paths and whether they should be connected or isolated. JasperGold reports which pass and which violate specification.</div>`
      }
    ]
  },
  {
    id: 'abstractions',
    title: 'Abstraction Techniques',
    icon: '🧩',
    subsections: [
      {
        title: 'Why Abstraction is Necessary',
        content: `<div class="lpara">State space explosion is the fundamental challenge in FPV. A design with N flip-flops has up to 2<sup>N</sup> reachable states. Abstraction replaces detailed logic with simpler models that preserve the properties being verified.</div>
<div class="lpara"><strong>Core principle:</strong> the abstract model must be a <em>superset</em> of the concrete model's behaviours — it may allow more behaviours (over-approximation) but must allow all real ones (soundness).</div>
<table class="ltbl"><tr><th>Technique</th><th>What it replaces</th><th>Soundness</th></tr>
<tr><td><code>set_blackbox</code></td><td>Entire module → free outputs</td><td>Over-approx: proofs hold, CEX may be spurious</td></tr>
<tr><td><code>stopat</code></td><td>One signal → free variable</td><td>Over-approx: proofs hold, CEX may be spurious</td></tr>
<tr><td>Counter abstraction</td><td>Counter → free variable + bounds</td><td>Sound if boundary constraints are correct</td></tr>
<tr><td>Memory abstraction</td><td>Full array → one symbolic entry</td><td>Sound by substitution principle</td></tr>
<tr><td>FIFO abstraction</td><td>Full FIFO state → 3 properties</td><td>Sound if 3 properties correctly characterise FIFO</td></tr>
<tr><td><code>set_case_analysis</code></td><td>Signal → constant (at elaboration time)</td><td>Sound for fixed-constant signals</td></tr>
</table>`
      },
      {
        title: 'FIFO Abstraction — The 3-Property Pattern',
        content: `<div class="lpara">A FIFO with depth D and width W has D×W state bits. For D=256, W=32 that's 8192 bits — catastrophic. The abstraction reduces this to ~log<sub>2</sub>(D) bits.</div>
<div class="lcode">// Property 1: Occupancy bounds
assert property (@(posedge clk) disable iff (!rst_n)
  occupancy >= 0 && occupancy <= DEPTH);

// Property 2: Flag correctness
assert property (@(posedge clk) disable iff (!rst_n)
  full  == (occupancy == DEPTH));
assert property (@(posedge clk) disable iff (!rst_n)
  empty == (occupancy == 0));

// Property 3: Data integrity — symbolic scoreboard
// (see Symbolic Variable Pattern below)

// In JasperGold TCL: blackbox the FIFO, then add these as assumes
set_blackbox -design {fifo_impl}
assume property (@(posedge clk) full == (occupancy==DEPTH));
assume property (@(posedge clk) empty == (occupancy==0));</div>`
      },
      {
        title: 'Symbolic Variable Memory Pattern',
        content: `<div class="lcode">// DO NOT do this — 256×32 = 8192 state bits:
// logic [31:0] mem [0:255];  // ← kills FPV

// DO this — symbolic address/data trick:
module mem_fv_props #(parameter AW=8, DW=32) (
  input clk, rst_n,
  input wr_en, input [AW-1:0] wr_addr, input [DW-1:0] wr_data,
  input rd_en, input [AW-1:0] rd_addr, output [DW-1:0] rd_data);

  // Free (unconstrained) symbolic variables
  // The solver treats these as "for all addresses and data"
  logic [AW-1:0] sym_addr;
  logic [DW-1:0] sym_data;

  // Track: was sym_data written to sym_addr?
  logic written;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) written <= 0;
    else if (wr_en && wr_addr==sym_addr && wr_data==sym_data)
      written <= 1;

  // Assert: once written, reading sym_addr returns sym_data
  ap_integrity: assert property (
    @(posedge clk) disable iff (!rst_n)
    written && rd_en && rd_addr==sym_addr
    |-> rd_data == sym_data);
endmodule
bind mem_model mem_fv_props fv_i (.*);</div>
<div class="lnote">💡 sym_addr and sym_data are universally quantified — one proof covers ALL addresses and ALL data values simultaneously, without allocating the full memory array.</div>`
      },
      {
        title: 'Ghost Variables — Correct Pattern',
        content: `<div class="lcode">// WRONG — ghost logic inside RTL module (will be synthesised!):
module arbiter (...);
  logic [7:0] req_age;   // ← NEVER PUT GHOST LOGIC HERE
  always_ff @(posedge clk) req_age <= req_age + 1;
  ...
endmodule

// CORRECT — ghost logic in a separate bind file:
module arbiter_fv (input clk, rst_n, req, ack);
  // Ghost: tracks how long req has been waiting
  logic [7:0] req_age;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n || !req) req_age <= 0;
    else req_age <= req_age + 1;

  // Bounded latency assertion using the ghost variable
  ap_max_latency: assert property (
    @(posedge clk) disable iff (!rst_n)
    req_age >= MAX_WAIT |-> ack);
endmodule

// Wire it in non-intrusively — RTL source unchanged
bind arbiter arbiter_fv fv_i (.*);</div>`
      }
    ]
  },
  {
    id: 'two-phase',
    title: 'Two-Phase FPV Methodology',
    icon: '📋',
    subsections: [
      {
        title: 'Phase 1: Structural Verification',
        content: `<div class="lpara">Before writing a single SVA property, run the structural apps. These catch fundamental RTL quality issues that would corrupt functional proofs if left unfixed.</div>
<table class="ltbl"><tr><th>Step</th><th>App</th><th>What you get</th></tr>
<tr><td>1</td><td>Superlint</td><td>Latch list, reset-incomplete FFs, dead states, combo loops</td></tr>
<tr><td>2</td><td>Coverage App</td><td>Unreachable line/branch/state targets → exclude from sim goals</td></tr>
<tr><td>3</td><td>Connectivity App</td><td>Verified / violated signal paths between blocks</td></tr>
<tr><td>4</td><td>CDC App</td><td>Structural CDC violations, synchroniser topology</td></tr>
</table>
<div class="lnote">✅ Phase 1 typically takes days and finds real bugs before any property writing. Very high ROI.</div>`
      },
      {
        title: 'Phase 2: Functional FPV — Property Writing Order',
        content: `<table class="ltbl"><tr><th>Step</th><th>Property type</th></tr>
<tr><td>1</td><td>Reset + initialisation properties — always required first</td></tr>
<tr><td>2</td><td>Interface protocol properties (handshake, ordering, stability)</td></tr>
<tr><td>3</td><td>FSM completeness covers + illegal-state asserts</td></tr>
<tr><td>4</td><td>Data integrity (local variable pattern, symbolic scoreboard)</td></tr>
<tr><td>5</td><td>Safety invariants (no overflow, no deadlock, no underflow)</td></tr>
<tr><td>6</td><td>Run check_vacuity on every assert</td></tr>
<tr><td>7</td><td>Run mutation test to validate property quality</td></tr>
<tr><td>8</td><td>Produce sign-off document</td></tr>
</table>`
      },
      {
        title: 'Sign-off Checklist',
        content: `<table class="ltbl"><tr><th>Item</th><th>Required status</th></tr>
<tr><td>All assert properties</td><td>Proven or Bounded (depth documented)</td></tr>
<tr><td>All cover properties</td><td>Covered (no Uncovered without waiver)</td></tr>
<tr><td>Vacuity check</td><td>Clean — all antecedents demonstrably fire</td></tr>
<tr><td>Assumption consistency</td><td>check_assumptions passes</td></tr>
<tr><td>COI completeness</td><td>All primary outputs in COI of ≥1 property</td></tr>
<tr><td>Mutation score</td><td>≥85% (or agreed threshold)</td></tr>
<tr><td>Unreachable coverage</td><td>All Unreachable targets reviewed and dispositioned</td></tr>
<tr><td>Sign-off document</td><td>Signed by FV engineer + RTL designer</td></tr>
</table>`
      }
    ]
  },
  {
    id: 'sva-patterns',
    title: 'Common SVA Property Patterns',
    icon: '📝',
    subsections: [
      {
        title: 'Reset Properties',
        content: `<div class="lcode">// FSM in IDLE after reset deasserts
ap_reset_state: assert property (
  @(posedge clk) disable iff (!rst_n)
  $rose(rst_n) |=> state == IDLE);

// Counter resets to zero
ap_reset_count: assert property (
  @(posedge clk) $rose(rst_n) |=> count == '0);

// All outputs deassert during reset
ap_reset_outputs: assert property (
  @(posedge clk) !rst_n |-> !valid_out && !error_out);</div>`
      },
      {
        title: 'AXI-Style Handshake Properties',
        content: `<div class="lcode">// Valid must not deassert while waiting for ready
ap_valid_stable: assert property (
  @(posedge clk) disable iff (!rst_n)
  valid && !ready |=> valid);

// Data must be stable while valid not yet accepted
ap_data_stable: assert property (
  @(posedge clk) disable iff (!rst_n)
  valid && !ready |=> $stable(data));

// Transaction eventually completes (bounded)
ap_handshake_progress: assert property (
  @(posedge clk) disable iff (!rst_n)
  valid |-> ##[1:MAX_WAIT] (valid && ready));

// Cover: a transaction actually happens
cp_handshake: cover property (
  @(posedge clk) valid && ready);</div>`
      },
      {
        title: 'FIFO / Credit Counter Properties',
        content: `<div class="lcode">// No push when full
ap_no_overflow: assert property (
  @(posedge clk) disable iff (!rst_n)
  full |-> !push_en);

// No pop when empty
ap_no_underflow: assert property (
  @(posedge clk) disable iff (!rst_n)
  empty |-> !pop_en);

// Occupancy in range
ap_occ_bound: assert property (
  @(posedge clk) disable iff (!rst_n)
  occupancy <= DEPTH);

// Credit counter: never below zero
ap_credits_nonneg: assert property (
  @(posedge clk) disable iff (!rst_n)
  credits >= 0);</div>`
      },
      {
        title: 'Arbiter Properties',
        content: `<div class="lcode">// Mutual exclusion — at most one grant
ap_onehot_grant: assert property (
  @(posedge clk) disable iff (!rst_n)
  $onehot0(grant));

// Grant only when corresponding request present
// (use generate loop for N lanes)
genvar i;
generate for (i=0; i<NUM_LANES; i++) begin : gen_arb
  ap_grant_req: assert property (
    @(posedge clk) disable iff (!rst_n)
    grant[i] |-> req[i]);
end endgenerate

// No spurious grant with no request
ap_no_spurious: assert property (
  @(posedge clk) disable iff (!rst_n)
  !req |-> !grant);</div>`
      },
      {
        title: 'Data Integrity (Local Variable Pattern)',
        content: `<div class="lcode">// Capture write data, verify read returns same value
property data_roundtrip;
  logic [DATA_W-1:0] cap;
  @(posedge clk) disable iff (!rst_n)
  // Capture data at write
  (wr_en, cap = wr_data)
  // Check it comes back correctly at read
  |-> ##[1:MAX_LATENCY] (rd_valid && rd_data == cap);
endproperty
ap_data_integrity: assert property (data_roundtrip);

// Cover the roundtrip actually happens
cp_roundtrip: cover property (
  @(posedge clk) wr_en ##[1:MAX_LATENCY] rd_valid);</div>`
      }
    ]
  },
  {
    id: 'debug-guide',
    title: 'FPV Debug Decision Tree',
    icon: '🐛',
    subsections: [
      {
        title: 'My assertion is Proven — is it trustworthy?',
        content: `<div class="dtree">
<div class="dstep">1️⃣ Run companion cover on the antecedent. Is it Covered?</div>
<div class="dyes">YES → antecedent fires. Not vacuous on antecedent side. ✓ Continue.</div>
<div class="dno">NO → VACUOUS PROOF. Antecedent never fires. Proof is worthless. Fix the environment or the property.</div>
<div class="dstep">2️⃣ Run check_assumptions. Any contradictions reported?</div>
<div class="dyes">YES → contradictory assumes. The solver proved anything. Fix assumes first, re-run everything.</div>
<div class="dno">NO → environment is consistent. ✓ Continue.</div>
<div class="dstep">3️⃣ Mutate the RTL (flip an operator). Does the assertion catch it?</div>
<div class="dyes">YES → property is sensitive to RTL changes. ✓ Trust it.</div>
<div class="dno">NO → property may be too weak or consequent is a tautology. Strengthen it.</div>
</div>`
      },
      {
        title: 'I have a CEX — is it real or spurious?',
        content: `<div class="dtree">
<div class="dstep">1️⃣ Load the CEX waveform. Does the stimulus at cycle 0 look physically possible?</div>
<div class="dyes">YES → continue analysis.</div>
<div class="dno">NO → missing assume constraint. Write the assume. Re-run.</div>
<div class="dstep">2️⃣ Is there a blackboxed module whose output value in the CEX the real module would never produce?</div>
<div class="dyes">YES → spurious CEX from over-approximation. Add interface contract assumes to the blackboxed module.</div>
<div class="dno">NO → continue tracing. Likely real.</div>
<div class="dstep">3️⃣ Trace the causality chain in the waveform. Does each cycle look RTL-correct?</div>
<div class="dyes">YES all the way to the failure → real bug. File it.</div>
<div class="dno">Breaks at some cycle → that cycle has impossible stimulus. Add assume for that condition.</div>
</div>`
      },
      {
        title: 'Proof not converging — triage order',
        content: `<table class="ltbl"><tr><th>Step</th><th>Action</th><th>JG Command</th></tr>
<tr><td>1</td><td>Check COI size</td><td><code>report_coi -property &lt;name&gt;</code></td></tr>
<tr><td>2</td><td>Blackbox largest irrelevant submodules</td><td><code>set_blackbox -design {mod}</code></td></tr>
<tr><td>3</td><td>Force constant signals</td><td><code>set_case_analysis 0 {dft_mode}</code></td></tr>
<tr><td>4</td><td>Switch to PDR-only engine</td><td><code>set_engine_mode Ht</code></td></tr>
<tr><td>5</td><td>Abstract wide data buses</td><td><code>stopat dut/wide_bus_signal</code></td></tr>
<tr><td>6</td><td>Add strengthening invariant</td><td>Helper assert property on intermediate invariant</td></tr>
<tr><td>7</td><td>Case split</td><td><code>assume property (count &lt; HALF)</code> + separate run</td></tr>
<tr><td>8</td><td>Accept bounded result</td><td><code>set_max_trace_length N</code> + document</td></tr>
</table>`
      }
    ]
  }
  ,
  {
    id: 'certitude',
    title: 'Certitude & VC Formal (Synopsys)',
    icon: '🧬',
    subsections: [
      {
        title: 'What Certitude Is — and the Rebranding',
        content: `<div class="lpara"><strong>Certitude</strong> (now rebranded as <strong>Testbench Quality Assurance / TQA</strong>) is Synopsys' mutation-based testbench qualification tool. It answers the question structural coverage cannot: <em>"Does my verification environment actually catch bugs?"</em></div>
<div class="lpara">It integrates natively with both VCS (simulation) and VC Formal (FPV). The formal integration is delivered through the <strong>Formal Testbench Analyzer (FTA)</strong> app inside VC Formal, which wraps the Certitude fault injection engine.</div>
<table class="ltbl"><tr><th>Old name</th><th>Current name</th><th>Where it lives</th></tr>
<tr><td>Certitude</td><td>Testbench QA (TQA)</td><td>Standalone + inside VC Formal FTA app</td></tr>
<tr><td>FTA App</td><td>Formal Testbench Analyzer</td><td>VC Formal app powered by Certitude engine</td></tr>
</table>
<div class="lnote">⚠️ Interviewers sometimes say "Certitude" and "FTA" interchangeably. FTA is the VC Formal wrapper around the Certitude engine. Same underlying technology.</div>`
      },
      {
        title: 'The Core Problem Certitude Solves',
        content: `<div class="lpara">Coverage — structural, functional, formal — tells you <em>which parts of the RTL were exercised</em>. It says nothing about whether your assertions would <em>actually detect a bug</em> in those parts.</div>
<div class="lpara">In FPV this is especially dangerous: if your assume set is over-constrained or your assertions are tautological, VC Formal proves everything and reports zero failures. The proofs are mathematically valid — but they catch nothing. <strong>100% proven does not equal correct design.</strong></div>
<div class="lpara">Certitude's answer: inject hundreds or thousands of artificial bugs (mutations) into the RTL, one at a time, and re-run the formal proof. At least one assertion fails → <strong>detected</strong>. All assertions still pass → <strong>undetected</strong> → verification hole.</div>
<div class="lnote">💡 A formal proof that survives fault injection means your property set cannot distinguish a buggy RTL from the correct one. That is a critical sign-off finding, not a passing grade.</div>`
      },
      {
        title: 'Fault Models — What Gets Mutated',
        content: `<div class="lpara">Each mutation is a single, syntactically-correct RTL change modelling the types of bugs engineers actually introduce:</div>
<table class="ltbl"><tr><th>Fault type</th><th>Example mutation</th><th>What it probes</th></tr>
<tr><td><strong>Stuck-at-0</strong></td><td><code>credits &lt;= credits - 1</code> → <code>credits &lt;= 0</code></td><td>Register stuck at zero</td></tr>
<tr><td><strong>Stuck-at-1</strong></td><td><code>full &lt;= (occ==DEPTH)</code> → <code>full &lt;= 1</code></td><td>Flag permanently asserted</td></tr>
<tr><td><strong>Operator substitution</strong></td><td><code>&lt;=</code> → <code>&lt;</code>, <code>+</code> → <code>-</code>, <code>&amp;&amp;</code> → <code>||</code></td><td>Comparator / arithmetic / logic</td></tr>
<tr><td><strong>Constant substitution</strong></td><td><code>count &lt;= MAX</code> → <code>count &lt;= MAX-1</code></td><td>Off-by-one boundary conditions</td></tr>
<tr><td><strong>Condition negation</strong></td><td><code>if (valid &amp;&amp; ready)</code> → <code>if (!valid &amp;&amp; ready)</code></td><td>Boolean enable / guard conditions</td></tr>
<tr><td><strong>Assignment flip</strong></td><td><code>state &lt;= IDLE</code> → <code>state &lt;= BUSY</code></td><td>FSM transition target</td></tr>
<tr><td><strong>Expression substitution</strong></td><td><code>wr_ptr + 1</code> → <code>wr_ptr</code></td><td>Pointer / counter update logic</td></tr>
</table>
<div class="lnote">These model exactly the off-by-one, wrong-operator, and wrong-state bugs that escape to silicon. Not random — systematically derived from real RTL error patterns.</div>`
      },
      {
        title: 'Mutation Score — Interpreting the Output',
        content: `<div class="lcode">Mutation Score = (Detected Mutants) / (Total Mutants - Equivalent Mutants) x 100%</div>
<table class="ltbl"><tr><th>Result per mutant</th><th>Meaning</th></tr>
<tr><td>✅ <strong>Detected</strong></td><td>At least one assertion produced a CEX under this mutation — your properties would have caught this bug</td></tr>
<tr><td>❌ <strong>Undetected</strong></td><td>All assertions still prove despite the RTL being wrong — verification hole</td></tr>
<tr><td>⬛ <strong>Equivalent</strong></td><td>Mutation does not change observable behaviour — not a real bug. Excluded from score.</td></tr>
<tr><td>⏳ <strong>Timeout</strong></td><td>Proof did not converge for this mutant — inconclusive, not counted in score</td></tr>
</table>
<ul class="llist">
<li><strong>85–100%:</strong> Strong property set. Acceptable for most sign-off targets.</li>
<li><strong>70–85%:</strong> Moderate. Undetected mutants need triage — missing assertions or over-constrained environment?</li>
<li><strong>Below 70%:</strong> Significant holes. Properties too weak or environment is masking bugs.</li>
</ul>
<div class="lnote">There is no universal threshold. What matters is that every undetected mutant is triaged: new assertion written, or documented as out-of-scope with justification.</div>`
      },
      {
        title: 'FTA Workflow Inside VC Formal',
        content: `<div class="lpara">FTA reuses the same elaborated formal model — clock, reset, assumes, asserts already configured. No separate simulation setup. Synopsys claims 5–10x speedup versus standalone simulation-based mutation testing because the formal engine explores all inputs exhaustively per mutant.</div>
<ul class="llist">
<li>Set up FPV normally: analyze → elaborate → clock → reset → assumes → asserts</li>
<li>Launch FTA: it enumerates mutations across the RTL automatically</li>
<li>Per mutant: RTL modified, formal proof re-run over all assertions</li>
<li>CEX found → detected. All prove → undetected → flagged in Verdi and report</li>
<li>Output: mutation score, assertion-to-mutant detection map, annotated RTL source in Verdi</li>
</ul>
<div class="lnote">💡 The FTA report is an assertion-quality heatmap. Clusters of undetected mutants in a module tell you exactly where new properties are needed — no guesswork.</div>`
      },
      {
        title: 'Three Root Causes of an Undetected Mutant',
        content: `<div class="dtree">
<div class="dstep">1️⃣ Missing assertion — the mutated logic is not covered by any property</div>
<div class="dyes">Fix: write a new assertion targeting the mutated signal or expression. Re-run FTA to confirm improvement.</div>

<div class="dstep">2️⃣ Over-constrained environment — assume set blocks the solver from exploring inputs that would expose the mutation</div>
<div class="dyes">Fix: loosen the assume. Check_assumptions to verify consistency. Re-run FTA — if mutant becomes detected, the original assume was hiding a bug.</div>

<div class="dstep">3️⃣ Weak or tautological assertion — an assertion exists but its consequent cannot distinguish mutated from correct behaviour</div>
<div class="dyes">Fix: strengthen the consequent. Review for tautologies (see SVA Internals — consequent vacuity). Re-run.</div>
</div>
<div class="lnote">An undetected mutant and a vacuous proof are two symptoms of the same disease — a property set not doing real work in that region of the design.</div>`
      },
      {
        title: 'Certitude / FTA vs JasperGold Mutation — Comparison',
        content: `<table class="ltbl"><tr><th></th><th>Certitude / FTA (Synopsys)</th><th>JasperGold Mutation (Cadence)</th></tr>
<tr><td><strong>Tool</strong></td><td>VC Formal + Certitude engine via FTA app</td><td>JasperGold — native mutation app</td></tr>
<tr><td><strong>Fault models</strong></td><td>Stuck-at, operator sub, constant sub, expression swap</td><td>Same categories — called mutation operators in JG</td></tr>
<tr><td><strong>Speed</strong></td><td>5–10x vs sim-based; formal exhaustive per mutant</td><td>Same advantage — formal exhaustiveness per mutant</td></tr>
<tr><td><strong>Debug output</strong></td><td>Verdi source annotation + assertion-to-mutant map</td><td>JG GUI highlight + property quality report</td></tr>
<tr><td><strong>Equivalent mutants</strong></td><td>Semantic analysis to identify and exclude</td><td>Formal proof: mutant proven equivalent → excluded</td></tr>
<tr><td><strong>Sign-off output</strong></td><td>Mutation score + undetected list + Verdi annotation</td><td>Mutation score + property quality report in JG</td></tr>
</table>
<div class="lnote">💡 The concepts — score, detected/undetected/equivalent, fault models — are identical across both tools. At interview: acknowledge the equivalence but know the Synopsys naming cold.</div>`
      },
      {
        title: 'Full VC Formal App Ecosystem',
        content: `<table class="ltbl"><tr><th>App</th><th>Code</th><th>JG equivalent</th><th>Purpose</th></tr>
<tr><td>Formal Property Verification</td><td>FPV</td><td>JasperGold FPV</td><td>Prove SVA assert/assume/cover properties</td></tr>
<tr><td>Automatic Extracted Properties</td><td>AEP</td><td>Superlint (partial)</td><td>Auto-checks: overflow, X-assign, multi-driver, parallel case — no assertions needed</td></tr>
<tr><td>Formal Coverage Analyzer</td><td>FCA</td><td>Coverage App</td><td>Proves coverage targets reachable / unreachable</td></tr>
<tr><td>Connectivity Checking</td><td>CC</td><td>Connectivity App</td><td>Proves / disproves signal paths at SoC level</td></tr>
<tr><td>Formal Testbench Analyzer</td><td>FTA</td><td>Mutation App</td><td>Certitude mutation score — assertion quality measurement</td></tr>
<tr><td>Sequential Equivalence Checking</td><td>SEQ</td><td>—</td><td>Proves two RTL implementations behaviourally equivalent</td></tr>
<tr><td>X-Propagation Verification</td><td>FXP</td><td>Superlint X-prop</td><td>Formally traces X propagation through design to outputs</td></tr>
<tr><td>Datapath Validation</td><td>DPV</td><td>—</td><td>HECTOR engine for ALU/FPU/DSP transaction-level equivalence</td></tr>
<tr><td>Functional Safety</td><td>FuSa</td><td>—</td><td>ISO 26262 fault classification: observable, detectable, latent</td></tr>
<tr><td>Regression Mode Accelerator</td><td>RMA</td><td>—</td><td>ML-based engine orchestration for faster nightly regression</td></tr>
</table>`
      }
    ]
  }
];