// ============================================================
// TCL SCRIPTING REFERENCE  —  JasperGold detailed reference
// ============================================================
const TCL_SECTIONS = [
  {
    id: 'tcl-language',
    title: 'TCL Language Essentials',
    icon: '📖',
    subsections: [
      {
        title: 'Why TCL in JasperGold?',
        content: `<div class="lpara">Every JasperGold operation — loading files, setting clocks, running proofs, reporting results — has a TCL equivalent. Production FPV flows are 100% TCL-driven for repeatability and CI/CD integration. The GUI is optional; batch mode is the norm.</div>
<div class="lcode">## Run JasperGold in batch mode (CI/CD standard)
jg -batch -tcl run_fpv.tcl -logfile run.log

## Invoke interactively then source a script
jg
jg> source run.tcl

## Check version
jg -version</div>`
      },
      {
        title: 'Variables, Arithmetic, and Strings',
        content: `<div class="lcode">## Variables — always use $ to dereference
set module_name "my_arbiter"
set width 32
puts $module_name          ;# prints: my_arbiter

## Arithmetic — ALWAYS use expr {}
set result [expr {$width * 2}]
set depth  [expr {$width / 8}]
puts "Result: $result"

## String interpolation in double-quotes
set prop "ap_\${module_name}_grant"
puts $prop                 ;# prints: ap_my_arbiter_grant

## String commands
set upper [string toupper $module_name]
set len   [string length $module_name]
set sub   [string range $module_name 0 2]

## List of strings — common in JasperGold
set modules {arb fifo credit_ctr}
llength $modules           ;# returns 3
lindex  $modules 0         ;# returns: arb
lappend modules "new_mod"  ;# appends to list</div>`
      },
      {
        title: 'Control Flow',
        content: `<div class="lcode">## Conditional
if {$width == 32} {
  puts "32-bit design"
} elseif {$width == 64} {
  puts "64-bit design"
} else {
  error "Unsupported width: $width"
}

## For loop
for {set i 0} {$i < 4} {incr i} {
  puts "Lane $i"
}

## Foreach — most common in JasperGold scripts
foreach lane {0 1 2 3} {
  puts "Processing lane $lane"
}

## Foreach over a list variable
set props [list ap_grant ap_no_overflow ap_onehot]
foreach p $props {
  puts "Checking: $p"
}

## While
set tries 0
while {$tries < 3} {
  incr tries
  puts "Attempt $tries"
}</div>`
      },
      {
        title: 'proc — Procedures (Functions) Explained',
        content: `<div class="lpara"><code>proc</code> defines a reusable procedure — TCL's equivalent of a function. It is one of the most important constructs in production FPV scripts. Every time you find yourself repeating a setup block across multiple run scripts, it belongs in a proc.</div>

<div class="lpara"><strong>Syntax:</strong></div>
<div class="lcode">proc &lt;name&gt; {&lt;arg1&gt; &lt;arg2&gt; ...} {
  # body
  return &lt;value&gt;   ;# optional — if omitted, returns empty string
}</div>

<div class="lpara"><strong>Basic examples:</strong></div>
<div class="lcode">## No arguments
proc hello {} {
  puts "Hello from a proc"
}
hello   ;# call it — no parentheses in TCL, ever

## With arguments
proc add {a b} {
  return [expr {$a + $b}]
}
set result [add 3 5]   ;# result = 8

## Arguments are LOCAL — they do not leak into the caller scope
proc example {x} {
  set y 99     ;# y is local to this proc
  return $x
}
# After calling example, $y does not exist in outer scope</div>

<div class="lpara"><strong>Variable scope rules — critical to get right:</strong></div>
<div class="lcode">## Proc has its own scope — outer variables are NOT visible inside
set global_depth 100

proc bad_example {} {
  puts $global_depth   ;# ERROR — global_depth not visible here
}

## To access outer/global variables: use 'global' declaration
proc good_example {} {
  global global_depth
  puts $global_depth   ;# NOW visible: prints 100
}

## Or pass it as an argument (preferred — more explicit)
proc better_example {depth} {
  puts $depth
}
better_example $global_depth</div>

<div class="lpara"><strong>Default argument values:</strong></div>
<div class="lcode">## Give an argument a default value with {arg default} syntax
proc run_check {prop_name {timeout 600} {depth 100}} {
  puts "Checking: $prop_name (timeout=$timeout depth=$depth)"
  set_prove_time_limit $timeout
  set_max_trace_length $depth
  check_property -include $prop_name
}

run_check "ap_no_overflow"           ;# uses defaults: 600s, depth 100
run_check "ap_grant" 1800            ;# custom timeout, default depth
run_check "ap_latency" 1800 200      ;# both overridden</div>

<div class="lpara"><strong>Variable-length argument list with args:</strong></div>
<div class="lcode">## 'args' captures all remaining arguments as a list
proc blackbox_all {args} {
  foreach mod $args {
    puts "Blackboxing: $mod"
    set_blackbox -design $mod
  }
}

blackbox_all mem_ctrl cache prefetch   ;# any number of modules</div>

<div class="lpara"><strong>Returning multiple values via a list:</strong></div>
<div class="lcode">## TCL has no tuples — return a list, unpack with lindex or lassign
proc get_proof_summary {} {
  set proven  [llength [get_property_list -include {status == proven}]]
  set cex     [llength [get_property_list -include {status == cex}]]
  set unknown [llength [get_property_list -include {status == unknown}]]
  return [list $proven $cex $unknown]
}

set summary [get_proof_summary]
lassign $summary n_proven n_cex n_unk
puts "Proven=$n_proven  CEX=$n_cex  Unknown=$n_unk"</div>

<div class="lpara"><strong>Error handling with catch — essential in CI scripts:</strong></div>
<div class="lcode">## catch {script} errvar — returns 0 on success, 1 on error
## errvar receives the error message string

if {[catch {elaborate -top $TOP_MODULE} err_msg]} {
  puts "FATAL: Elaboration failed — $err_msg"
  exit 1
}

## Wrap any risky operation
proc safe_blackbox {modname} {
  if {[catch {set_blackbox -design $modname} err]} {
    puts "WARNING: Could not blackbox $modname: $err"
    return 0
  }
  return 1
}

## Use it — script continues even if blackbox fails
foreach mod {opt_mod_a opt_mod_b} {
  safe_blackbox $mod
}</div>

<div class="lnote">💡 <strong>Key proc rules to remember:</strong><br>
1. Call with <code>name arg1 arg2</code> — no parentheses, no commas.<br>
2. Proc has its own variable scope — use <code>global</code> or pass as argument.<br>
3. <code>return</code> is optional; proc returns the value of the last evaluated expression if omitted.<br>
4. Always wrap CI-critical calls in <code>catch</code> — JasperGold commands can throw on bad input.</div>`
      },
      {
        title: 'File I/O — Useful for Reports and Waivers',
        content: `<div class="lcode">## Write to a file
set fh [open "results.txt" w]
puts $fh "=== FPV Results ==="
foreach p [get_property_list -include {<all>}] {
  set status [get_property_result $p]
  puts $fh "$p: $status"
}
close $fh

## Read from a file (e.g., waiver list)
set fh [open "waivers.txt" r]
while {[gets $fh line] >= 0} {
  puts "Waiver: $line"
}
close $fh

## Create directories
file mkdir fpv_results
file mkdir fpv_results/witnesses

## Check file exists
if {[file exists "filelist.f"]} {
  puts "filelist.f found"
} else {
  error "filelist.f not found — check your paths"
}</div>`
      }
    ]
  },
  {
    id: 'tcl-setup',
    title: 'Design Setup Commands',
    icon: '⚙️',
    subsections: [
      {
        title: 'clear and analyze',
        content: `<div class="lcode">## Always start fresh — clears the entire JasperGold state
clear -all

## Analyze (parse + syntax check) — pick the right SV standard
analyze -sv09  -f filelist.f          ;# SystemVerilog 2009
analyze -sv12  -f filelist.f          ;# SV 2012 (needed for strong operators)

## With defines and include paths
analyze -sv09 \\
  +define+FPV=1 \\
  +define+SYNTHESIS=0 \\
  +incdir+./rtl/include \\
  +incdir+./fv/include \\
  -f filelist.f

## Analyze individual files (no filelist)
analyze -sv09 ./rtl/arbiter.sv ./fv/arbiter_props.sv

## Check analyze succeeded before proceeding
if {[get_status -analyze] != "ok"} {
  puts "ERROR: Analysis failed"
  exit 1
}</div>
<div class="lnote">💡 Use <code>+define+FPV=1</code> so RTL code guards like <code>\`ifdef FPV ... \`endif</code> include your bind files and property modules. Synthesis then never sees verification code.</div>`
      },
      {
        title: 'elaborate',
        content: `<div class="lcode">## Basic elaboration — synthesis for formal analysis
elaborate -top my_module

## With parameters
elaborate -top my_fifo \\
  -parameter {WIDTH 32} \\
  -parameter {DEPTH 16}

## Elaborate specific instance in a wrapper
elaborate -top tb_top -instance {tb_top.u_dut}

## Check elaboration status
if {[get_status -elaborate] != "ok"} {
  puts "ERROR: Elaboration failed"
  report_elaborate_issues
  exit 1
}

## Show design hierarchy after elaboration
report_design_info</div>`
      },
      {
        title: 'clock — Getting It Right',
        content: `<div class="lcode">## Single primary clock
clock clk

## Single clock with explicit period (time units)
clock clk -period 10

## Check both rising and falling edges drive FFs
clock clk -both_edges

## Multiple related clocks (ratio specified)
clock clk_core
clock clk_half -factor 2     ;# clk_half = clk_core / 2
clock clk_fast -factor 0.5   ;# clk_fast = clk_core × 2

## Completely independent asynchronous clocks
clock clk_src -independent
clock clk_dst -independent

## Generated clock (divide-by-2)
clock clk_div2 -generated -source clk -divide_by 2

## Gated clock (tell tool it's derived from clk)
clock clk_gated -derived_from clk

## ALWAYS verify after defining clocks
report_clocks</div>
<div class="lnote">⚠️ Wrong clock configuration is the single most common setup mistake. Always <code>report_clocks</code> after defining them. Incorrect clock relationships cause both spurious proofs and missed bugs.</div>`
      },
      {
        title: 'reset — Critical Details',
        content: `<div class="lcode">## Synchronous active-low reset (most common)
reset -expression {!rst_n}

## Synchronous active-high reset
reset -expression {rst}

## Asynchronous reset
reset -expression {!rst_n} -async

## Multi-signal reset (all must deassert to exit reset)
reset -expression {!rst_n && !por_n}

## Reset with explicit assertion sequence
## (hold reset for exactly 3 cycles, then deassert)
reset -expression {!rst_n} \\
  -sequence {{rst_n 0} {rst_n 0} {rst_n 0} {rst_n 1}}

## Verify reset configuration
report_reset</div>
<div class="lnote">⚠️ NEVER use <code>assume property (@(posedge clk) rst_n == 1'b0)</code> permanently. This locks the design in reset forever — all assertions become vacuously true. Use the <code>reset</code> command instead, which applies reset for a bounded period then deasserts it.</div>`
      },
      {
        title: 'Blackboxing and Abstraction',
        content: `<div class="lcode">## Blackbox a module — all outputs become free variables
set_blackbox -design {complex_submodule}

## Blackbox multiple modules via loop
foreach mod {mem_ctrl cache_block prefetch_unit} {
  set_blackbox -design $mod
}

## IMPORTANT: after blackboxing, constrain outputs to interface contract
set_blackbox -design {fifo_impl}
assume property (@(posedge clk)
  full == (occupancy == FIFO_DEPTH));
assume property (@(posedge clk)
  $onehot0(arb_grant) || arb_grant == 0);

## Signal-level cutpoint (stopat)
stopat dut/datapath/complex_unit/result_bus

## Force a constant signal (constant propagation at elaboration)
set_case_analysis 0 {dut.dft_scan_en}
set_case_analysis 1 {dut.func_mode}

## Abstract a specific signal to a free variable
set_abstract -variable {dut.wide_data_path}

## Check your abstraction didn't break everything —
## run a sanity cover that should always be reachable
cover property (@(posedge clk) 1'b1)</div>`
      }
    ]
  },
  {
    id: 'tcl-proof',
    title: 'Proof Commands and Engines',
    icon: '✅',
    subsections: [
      {
        title: 'check_property — Core Proof Command',
        content: `<div class="lcode">## Prove all properties in scope
check_property -include {<all>}

## Prove only assertions
check_property -type assert

## Prove only cover properties
check_property -type cover

## Prove a single named property
check_property -include {ap_no_overflow}

## Prove a list of specific properties
check_property -include {ap_grant ap_onehot ap_latency}

## Exclude specific properties
check_property -exclude {debug_cover_*}

## With time limit per property (seconds)
check_property -timeout 600

## With maximum BMC depth
check_property -bound 80

## Check then immediately report
check_property -include {<all>}
report_property -summary</div>`
      },
      {
        title: 'Engine Configuration',
        content: `<div class="lcode">## Default: BMC + PDR run in parallel
set_engine_mode {Ht Bmc}

## PDR/IC3 only (Ht = JasperGold's proof-based PDR engine)
## Better for: safety properties that need deep proof
## Converges when BMC thrashes on complex state
set_engine_mode Ht

## BMC only — bounded model checking
## Better for: finding shallow bugs fast, quick debug iterations
set_engine_mode Bmc

## k-Induction
set_engine_mode Ind

## All engines in parallel (uses more resources)
set_engine_mode {Ht Bmc Ind}

## Max BMC trace length (depth bound)
set_max_trace_length 100

## Time limit per property (seconds)
set_prove_time_limit 1800

## Memory limit (MB)
set_prove_mem_limit 16384

## Check what is currently configured
get_engine_mode</div>
<div class="lnote">💡 Convergence troubleshooting: if PDR (Ht) keeps diverging, try <code>set_engine_mode {Ht Bmc}</code> — let BMC find shallow bugs first, clearing the way for PDR. If BMC thrashes on a deep property, try <code>set_engine_mode Ht</code> alone.</div>`
      },
      {
        title: 'Vacuity and Assumption Checking',
        content: `<div class="lcode">## Check for vacuous proofs — antecedent never fires
check_vacuity -all

## Check a specific property
check_vacuity -property {ap_grant_onehot}

## Check assumption consistency — detects contradictory assumes
## If this fails, all your proofs are potentially meaningless
check_assumptions

## Report which assumes are active
report_assumptions

## The critical companion cover pattern:
## For every assert, write a matching cover on the antecedent
## assert property (state == S_GRANT |-> grant_valid);
cover property (@(posedge clk) state == S_GRANT); // must be Covered</div>`
      },
      {
        title: 'Reporting Results',
        content: `<div class="lcode">## Terminal summary
report_property -summary

## Full report — all properties
report_property -all

## Filter by status
report_property -include {status == proven}
report_property -include {status == cex}
report_property -include {status == covered}
report_property -include {status == uncovered}

## With proof depth info
report_property -verbose -all

## Export to files
report_property -all -out results.txt
report_property -all -format csv -out results.csv
report_property -all -format html -out report.html

## TCL list manipulation — useful for CI exit codes
set proven [get_property_list -include {status == proven}]
set cex    [get_property_list -include {status == cex}]
set uncov  [get_property_list -include {status == uncovered}]

puts "Proven:    [llength $proven]"
puts "Failures:  [llength $cex]"
puts "Uncovered: [llength $uncov]"

if {[llength $cex] > 0} {
  foreach p $cex { puts "FAIL: $p" }
  exit 1   ;# non-zero exit fails CI pipeline
}</div>`
      },
      {
        title: 'COI Analysis Commands',
        content: `<div class="lcode">## Report COI (cone of influence) for a property
report_coi -property {ap_no_overflow}

## Get COI as a TCL list of signal names
set coi_sigs [get_coi_signals -property {ap_no_overflow}]
puts "COI size: [llength $coi_sigs] signals"

## Print all COI signals (useful for understanding complexity)
foreach s $coi_sigs { puts "  COI: $s" }

## Check if a critical signal is in COI
if {[lsearch $coi_sigs "dut.credit_counter.count"] >= 0} {
  puts "credit count IS in COI — property exercises it ✓"
} else {
  puts "WARNING: credit count NOT in COI — property may be incomplete"
}

## Batch COI size report across all properties
foreach p [get_property_list -include {type == assert}] {
  set sz [llength [get_coi_signals -property $p]]
  puts [format "%-40s COI: %d signals" $p $sz]
}</div>
<div class="lnote">💡 Large COI = prime convergence failure candidate. Use COI analysis to identify which submodules to blackbox — blackbox the ones contributing the most signals to a property's COI.</div>`
      }
    ]
  },
  {
    id: 'tcl-coverage',
    title: 'Coverage App TCL',
    icon: '📊',
    subsections: [
      {
        title: 'Running the Coverage App',
        content: `<div class="lcode">## Full Coverage App script
clear -all
analyze -sv09 -f filelist.f
elaborate -top my_module
clock clk
reset -expression {!rst_n}

## Run coverage analysis — specify target types
check_coverage -type {line branch fsm toggle}

## Or all types at once
check_coverage -type all

## Reports
report_coverage -summary
report_coverage -type unreachable       ;# unreachable only
report_coverage -format html -out cov.html

## Get counts for CI
set total  [get_coverage_count -type all]
set cov    [get_coverage_count -type all -filter {status == covered}]
set unch   [get_coverage_count -type all -filter {status == unreachable}]
set undet  [get_coverage_count -type all -filter {status == undetermined}]
puts "Total: $total | Covered: $cov | Unreachable: $unch | Undet: $undet"</div>`
      },
      {
        title: 'Exporting Witnesses and Handling Unreachable',
        content: `<div class="lcode">## Export witnesses for all covered targets (simulation seeds)
file mkdir witnesses
foreach p [get_property_list -include {status == covered}] {
  report_witness -property $p \\
    -format vcd \\
    -out witnesses/\${p}.vcd
}
puts "Witnesses exported to ./witnesses/"

## Get all unreachable targets for review
set unreachable [get_coverage_list -filter {status == unreachable}]
puts "Formally unreachable: [llength $unreachable]"

## Write unreachable report for manual triage
set fh [open "unreachable_review.txt" w]
foreach t $unreachable {
  puts $fh "UNREACHABLE: $t"
}
close $fh

## Waive an accepted unreachable target (intentional dead code)
waive_coverage -name {dut.fsm.default_case} \\
  -reason "Fully decoded FSM; default is intentional dead code" \\
  -user "aryan.sharma"</div>`
      }
    ]
  },
  {
    id: 'tcl-automation',
    title: 'Automation Patterns',
    icon: '🤖',
    subsections: [
      {
        title: 'Full Production FPV Script Template',
        content: `<div class="lcode">## ============================================================
## run_fpv.tcl — Production FPV Script
## Usage: jg -batch -tcl run_fpv.tcl -logfile fpv.log
## ============================================================

## ── Configuration ────────────────────────────────────────────
set TOP_MODULE  "my_arbiter"
set FILE_LIST   "filelist.f"
set CLOCK_SIG   "clk"
set RESET_EXPR  {!rst_n}
set OUT_DIR     "./fpv_results"
set TIMEOUT     1800        ;# seconds per property
set MAX_DEPTH   100         ;# BMC bound

## ── Utility: timestamp ───────────────────────────────────────
proc ts {} { return [clock format [clock seconds] -format {%H:%M:%S}] }

## ── Setup ────────────────────────────────────────────────────
clear -all
file mkdir $OUT_DIR

## ── Analysis ─────────────────────────────────────────────────
puts "[ts] Analyzing RTL..."
analyze -sv09 +define+FPV=1 -f $FILE_LIST
if {[get_status -analyze] != "ok"} {
  puts "ERROR: Analysis failed"; exit 1
}

## ── Elaboration ──────────────────────────────────────────────
puts "[ts] Elaborating..."
elaborate -top $TOP_MODULE
if {[get_status -elaborate] != "ok"} {
  puts "ERROR: Elaboration failed"; exit 1
}

## ── Clock and Reset ──────────────────────────────────────────
clock $CLOCK_SIG
reset -expression $RESET_EXPR
report_clocks
report_reset

## ── Design-specific abstractions ─────────────────────────────
## (Uncomment and customise as needed)
# set_blackbox -design {mem_controller}
# set_case_analysis 0 {dut.dft_mode}
# stopat dut/datapath/wide_result

## ── Engine ───────────────────────────────────────────────────
set_engine_mode {Ht Bmc}
set_max_trace_length $MAX_DEPTH
set_prove_time_limit $TIMEOUT

## ── Sanity cover — if this fails, env is broken ──────────────
puts "[ts] Sanity check..."
cover property (@(posedge $CLOCK_SIG) 1'b1) -name sanity_alive
check_property -type cover -include {sanity_alive}

## ── Run proofs ───────────────────────────────────────────────
puts "[ts] Running proofs..."
check_property -include {<all>} -type assert
check_property -include {<all>} -type cover

## ── Vacuity check ────────────────────────────────────────────
puts "[ts] Checking vacuity..."
check_vacuity -all
check_assumptions

## ── Reports ──────────────────────────────────────────────────
puts "[ts] Generating reports..."
report_property -all -format html -out $OUT_DIR/results.html
report_property -summary

## ── CI Exit Code ─────────────────────────────────────────────
set cex_list   [get_property_list -include {status == cex}]
set uncov_list [get_property_list -include {type == assert} \\
                                  -include {status == unknown}]

if {[llength $cex_list] > 0} {
  puts "\\n❌ [llength $cex_list] FAILURES:"
  foreach p $cex_list { puts "  CEX: $p" }
  exit 1
} elseif {[llength $uncov_list] > 0} {
  puts "\\n⚠️  [llength $uncov_list] INCONCLUSIVE — needs review"
  exit 2
} else {
  puts "\\n✅ ALL PROPERTIES PROVEN (depth: $MAX_DEPTH)"
  exit 0
}</div>`
      },
      {
        title: 'Prove All Instances of a Module',
        content: `<div class="lcode">## Classic interview question — know this cold
## "Write a TCL script to prove all instances of a module in the SoC"

clear -all
analyze -sv09 +define+FPV=1 -f filelist.f
elaborate -top soc_top
clock clk
reset -expression {!rst_n}

## get_cells -hierarchical finds instances by module reference name
set instances [get_cells -hierarchical \\
  -filter {ref_name == credit_counter}]

puts "Found [llength $instances] credit_counter instances"

set pass_count 0
set fail_count 0

foreach inst $instances {
  puts "\\n─── Proving: $inst ───"

  ## Set context to this specific instance
  current_instance $inst

  ## Run all properties in this instance's scope
  check_property -include {<all>}

  set cex [get_property_list -include {status == cex}]
  if {[llength $cex] > 0} {
    puts "FAIL ($inst): $cex"
    incr fail_count
  } else {
    puts "PASS ($inst)"
    incr pass_count
  }
}

puts "\\nSummary: $pass_count passed, $fail_count failed"
if {$fail_count > 0} { exit 1 }</div>`
      },
      {
        title: 'Parameterised Sweep',
        content: `<div class="lcode">## Prove a module across multiple parameter configurations
## Common for credit counters, FIFOs, arbiters

set configs {
  {WIDTH  8  DEPTH  4}
  {WIDTH 16  DEPTH  8}
  {WIDTH 32  DEPTH 16}
  {WIDTH 64  DEPTH 32}
}

set all_pass 1

foreach cfg $configs {
  set w [lindex $cfg 1]
  set d [lindex $cfg 3]
  puts "\\n=== WIDTH=$w DEPTH=$d ==="

  clear -all
  analyze -sv09 +define+FPV=1 -f filelist.f
  elaborate -top my_fifo \\
    -parameter [list WIDTH $w] \\
    -parameter [list DEPTH $d]
  clock clk
  reset -expression {!rst_n}
  set_engine_mode {Ht Bmc}

  check_property -include {<all>}

  set cex [get_property_list -include {status == cex}]
  if {[llength $cex] > 0} {
    puts "FAIL (W=$w D=$d): $cex"
    set all_pass 0
  } else {
    puts "PASS (W=$w D=$d)"
  }
}

if {$all_pass} { puts "\\n✅ All configs proved" ; exit 0 } \\
else            { puts "\\n❌ Failures found"     ; exit 1 }</div>`
      },
      {
        title: 'Case Split Proof',
        content: `<div class="lcode">## Decompose a hard proof into sub-cases
## Use when full proof doesn't converge but sub-ranges do

set half 64

set results {}

foreach {label constraint} [list \\
  "lower" "count < $half" \\
  "upper" "count >= $half"] {

  puts "\\n=== Case: $label (\${constraint}) ==="
  clear -all
  analyze -sv09 -f filelist.f
  elaborate -top my_counter
  clock clk
  reset -expression {!rst_n}

  ## Case split constraint — restrict state space for this sub-proof
  assume property (@(posedge clk) $constraint)

  set_engine_mode Ht
  check_property -include {ap_no_overflow}

  set status [get_property_result ap_no_overflow]
  puts "  Result: $status"
  lappend results $label $status
}

## Both cases must be proven for overall proof to hold
set all_ok 1
foreach {label status} $results {
  if {$status != "proven"} {
    puts "FAILED case: $label → $status"
    set all_ok 0
  }
}
if {$all_ok} {
  puts "\\n✅ Property proven by exhaustive case split"
}</div>`
      },
      {
        title: 'Regression Baseline and Delta',
        content: `<div class="lcode">## Save a result baseline (run once, commit result file)
proc save_baseline {outfile} {
  set fh [open $outfile w]
  foreach p [get_property_list -include {<all>}] {
    puts $fh "$p [get_property_result $p]"
  }
  close $fh
  puts "Baseline saved: $outfile"
}

## Compare current run against saved baseline
proc check_baseline {baseline_file} {
  set regressions {}
  set fh [open $baseline_file r]
  while {[gets $fh line] >= 0} {
    lassign $line prop expected
    if {[catch {set actual [get_property_result $prop]} err]} {
      lappend regressions "MISSING: $prop"
      continue
    }
    if {$actual != $expected} {
      lappend regressions \\
        "REGRESSION: $prop was=$expected now=$actual"
    }
  }
  close $fh
  if {[llength $regressions] > 0} {
    puts "\\n⚠️  REGRESSIONS DETECTED:"
    foreach r $regressions { puts "  $r" }
    return 1
  }
  puts "✅ No regressions"
  return 0
}

## Usage in CI:
# save_baseline baseline.txt      ;# run once to establish
# check_baseline baseline.txt     ;# run every commit</div>`
      }
    ]
  },
  {
    id: 'tcl-cdc',
    title: 'CDC App TCL',
    icon: '⚡',
    subsections: [
      {
        title: 'CDC Analysis Script',
        content: `<div class="lcode">## CDC App TCL script
clear -all
analyze -sv09 -f filelist.f
elaborate -top my_soc_block

## Define clock domains
clock clk_src -domain src_domain
clock clk_dst -domain dst_domain
reset -expression {!rst_n}

## Run CDC analysis
check_cdc

## Declare synchronous clock groups (if applicable)
check_cdc -clock_group -sync {clk_src clk_dst} \\
  -name synchronous_clocks

## Enable FIFO detection (off by default)
check_cdc -check -rule -set {{fifo_detection true}}

## Mark static signals (no synchronisation needed)
check_cdc -signal_config {dut.cfg_static -static}

## Report
report_cdc -summary
report_cdc -violations
report_cdc -format html -out cdc_report.html

## Waive a known-OK crossing (verified by handshake properties)
waive_cdc -name {dut.req_sync_ff} \\
  -reason "2-FF synchroniser verified by ap_req_sync property" \\
  -user "aryan.sharma"</div>`
      }
    ]
  },
  {
    id: 'tcl-superlint',
    title: 'Superlint App TCL',
    icon: '🔍',
    subsections: [
      {
        title: 'Superlint Script',
        content: `<div class="lcode">## Superlint App — Phase 1 structural checks
clear -all
analyze -sv09 -f filelist.f
elaborate -top my_module
clock clk
reset -expression {!rst_n}

## Run all default Superlint checks
check_superlint

## Or specific check categories
check_superlint -type {latches resets dead_states combo_loops}

## Reports
report_superlint -all
report_superlint -severity {error}   ;# errors only

## Get latch list — any latches are usually bugs
set latches [get_superlint_list -type latch]
if {[llength $latches] > 0} {
  puts "⚠️  LATCHES FOUND ([llength $latches]):"
  foreach l $latches { puts "  $l" }
}

## Get FFs with no reset path
set no_rst [get_superlint_list -type reset_incomplete]
puts "FFs without reset: [llength $no_rst]"

## Export report
report_superlint -all -out superlint_report.txt
puts "Superlint complete. Review superlint_report.txt"</div>`
      }
    ]
  },
  {
    id: 'tcl-interview',
    title: 'Interview TCL Questions',
    icon: '🎤',
    subsections: [
      {
        title: 'Q: "Write a TCL script to prove all instances of module X"',
        content: `<div class="lpara">This is asked at virtually every senior FV interview. The key commands: <code>get_cells -hierarchical -filter</code> and <code>current_instance</code>.</div>
<div class="lcode">clear -all
analyze -sv09 +define+FPV=1 -f filelist.f
elaborate -top soc_top
clock clk
reset -expression {!rst_n}

set instances [get_cells -hierarchical \\
  -filter {ref_name == credit_counter}]
puts "Found [llength $instances] instances"

foreach inst $instances {
  puts "\\n─── $inst ───"
  current_instance $inst
  check_property -include {<all>}
  set cex [get_property_list -include {status == cex}]
  if {[llength $cex] > 0} { puts "FAIL: $cex" } \\
  else                     { puts "PASS" }
}</div>`
      },
      {
        title: 'Q: "How do you automate a case split in TCL?"',
        content: `<div class="lpara">Shows you understand both proof decomposition and TCL scripting. The key: run two separate JG sessions with different assume constraints, then verify both proved.</div>
<div class="lcode">## Run proof in two halves, verify both converge
foreach {label cond} {"lower" "count < 128" "upper" "count >= 128"} {
  clear -all
  analyze -sv09 -f filelist.f
  elaborate -top my_counter
  clock clk
  reset -expression {!rst_n}
  assume property (@(posedge clk) $cond)   ;# case split constraint
  check_property -include {ap_no_overflow}
  puts "$label: [get_property_result ap_no_overflow]"
}
## Both must return "proven" for full proof to hold</div>`
      },
      {
        title: 'Q: "How do you write a report loop that flags regressions?"',
        content: `<div class="lpara">Tests TCL list manipulation and understanding of CI integration.</div>
<div class="lcode">## After check_property runs:
set cex  [get_property_list -include {status == cex}]
set unk  [get_property_list -include {status == unknown}]
set prov [get_property_list -include {status == proven}]

puts "Proven:  [llength $prov]"
puts "Failed:  [llength $cex]"
puts "Unknown: [llength $unk]"

## Output a machine-readable summary for CI parsing
set fh [open "ci_summary.txt" w]
foreach p $cex  { puts $fh "FAIL $p" }
foreach p $unk  { puts $fh "UNKNOWN $p" }
foreach p $prov { puts $fh "PASS $p" }
close $fh

## Fail CI with non-zero exit if any failures
if {[llength $cex] > 0 || [llength $unk] > 0} { exit 1 }
exit 0</div>`
      },
      {
        title: 'Q: "What does set_blackbox do and when is it dangerous?"',
        content: `<div class="lpara">Tests depth of tool knowledge — not just usage but soundness implications.</div>
<div class="lcode">## set_blackbox removes module internals — outputs become free variables
set_blackbox -design {complex_sub}

## DANGEROUS if you forget to constrain the outputs:
## The solver can now drive complex_sub's outputs to ANY value,
## including values the real module would never produce.
## Result: spurious CEX that look real but aren't.

## CORRECT — always add interface contract assumes after blackboxing:
set_blackbox -design {arbiter_sub}
assume property (@(posedge clk) $onehot0(arb_grant));
assume property (@(posedge clk) arb_grant |-> $past(arb_req));

## Key interview point:
## - Proven with blackbox = proven for real module (sound)
## - CEX with blackbox = may be spurious (verify without blackbox)
## - Over-approximation = allows more behaviours than reality</div>`
      }
    ]
  }
];
