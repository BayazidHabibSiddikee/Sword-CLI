import re
import os

with open("main.py", "r") as f:
    content = f.read()

# Replace the single run logic with a loop that varies a resistor if found
old_run = """    netlist_content += f\"\"\"
* Analysis
.dc V1 -15 15 0.1

.control
    run
    let V_target = V(2)
    let I_target = -I(V1)
    wrdata {txt_out} V_target I_target
.endc
.end
\"\"\"
    with open(cir_path, 'w') as f:
        f.write(netlist_content)

    try:
        schemdraw_code = circuit_json.get("schemdraw_code", "")
        if schemdraw_code:
            local_vars = {}
            exec(schemdraw_code, globals(), local_vars)
            if 'draw_circuit' in local_vars:
                local_vars['draw_circuit'](schem_path)
            else:
                draw_triac_circuit(schem_path)
        else:
            draw_triac_circuit(schem_path)
    except Exception as e:
        print(f"Error executing schemdraw_code: {e}")
        draw_triac_circuit(schem_path)

    cir_file = cir_path

    print("Running ngspice simulation...")
    res = subprocess.run(["ngspice", "-b", cir_file], capture_output=True)
    if res.returncode != 0 or not os.path.exists(txt_out):
        print("Dynamic circuit failed, falling back to static triac circuit...")
        cir_file, txt_out = create_triac_netlist(run_dir)
        subprocess.run(["ngspice", "-b", cir_file], capture_output=True)

    print("Generating plots...")
    plot_path = os.path.join(run_dir, "figs", f"{slug}_plot.png")
    try:
        df = pd.read_csv(txt_out, sep=r'\\s+', header=None)
        plt.figure(figsize=(8, 6))
        plt.plot(df[2], df[3] * 1000, linewidth=2, color='b')
        plt.title(f"{args.name} Characteristics", fontsize=14)
        plt.xlabel("Voltage (V)", fontsize=12)
        plt.ylabel("Current (mA)", fontsize=12)
        plt.grid(True, which='both', linestyle='--', linewidth=0.5)
        plt.axhline(0, color='black', linewidth=1)
        plt.axvline(0, color='black', linewidth=1)
        plt.tight_layout()
        plt.savefig(plot_path, dpi=300)
        plt.close()
    except Exception as e:
        print(f"Error plotting: {e}")
        plot_path = ""
"""

new_run = """
    # Extract components and find a resistor to vary
    comps = circuit_json.get("netlist_components", [])
    var_res_idx = -1
    for i, c in enumerate(comps):
        if c.strip().upper().startswith("R"):
            var_res_idx = i
            break
            
    r_vals = ["1k", "5k", "10k"] if var_res_idx != -1 else ["1k"]
    colors = ['b', 'r', 'g']
    
    plt.figure(figsize=(8, 6))
    plt.title(f"{args.name} Characteristics", fontsize=14)
    plt.xlabel("Voltage (V)", fontsize=12)
    plt.ylabel("Current (mA)", fontsize=12)
    plt.grid(True, which='both', linestyle='--', linewidth=0.5)
    plt.axhline(0, color='black', linewidth=1)
    plt.axvline(0, color='black', linewidth=1)
    
    success_sim = False
    
    for r_idx, r_val in enumerate(r_vals):
        loop_txt_out = txt_out.replace('.txt', f'_{r_idx}.txt')
        
        loop_netlist = f"Dynamic Circuit: {args.name}\\n"
        if "TRIAC" in netlist_str or "triac" in args.name.lower():
            loop_netlist += f'.include "{triac_path}"\\n'
        if "DIAC" in netlist_str or "diac" in args.name.lower():
            loop_netlist += f'.include "{diac_path}"\\n'
        loop_netlist += "\\n* Circuit\\n"
        
        for i, comp in enumerate(comps):
            if i == var_res_idx:
                parts = comp.split()
                if len(parts) >= 4:
                    parts[3] = r_val
                    loop_netlist += " ".join(parts) + "\\n"
                else:
                    loop_netlist += f"{comp}\\n"
            else:
                loop_netlist += f"{comp}\\n"
                
        loop_netlist += f\"\"\"
* Analysis
.dc V1 -15 15 0.1

.control
    run
    let V_target = V(2)
    let I_target = -I(V1)
    wrdata {loop_txt_out} V_target I_target
.endc
.end
\"\"\"
        with open(cir_path, 'w') as f:
            f.write(loop_netlist)
            
        res = subprocess.run(["ngspice", "-b", cir_path], capture_output=True)
        if res.returncode == 0 and os.path.exists(loop_txt_out):
            success_sim = True
            try:
                df = pd.read_csv(loop_txt_out, sep=r'\\s+', header=None)
                plt.plot(df[2], df[3] * 1000, linewidth=2, color=colors[r_idx % len(colors)], label=f"R={r_val}")
            except Exception as e:
                pass

    if not success_sim:
        print("Dynamic circuit failed, falling back to static triac circuit...")
        cir_file, fb_txt_out = create_triac_netlist(run_dir)
        subprocess.run(["ngspice", "-b", cir_file], capture_output=True)
        try:
            df = pd.read_csv(fb_txt_out, sep=r'\\s+', header=None)
            plt.plot(df[2], df[3] * 1000, linewidth=2, color='b', label="Fallback")
            # Overwrite txt_out for the data table
            import shutil
            shutil.copy(fb_txt_out, txt_out)
        except Exception:
            pass
    else:
        # copy the first success to txt_out for table
        import shutil
        shutil.copy(txt_out.replace('.txt', '_0.txt'), txt_out)
        
    try:
        schemdraw_code = circuit_json.get("schemdraw_code", "")
        if schemdraw_code:
            local_vars = {}
            exec(schemdraw_code, globals(), local_vars)
            if 'draw_circuit' in local_vars:
                local_vars['draw_circuit'](schem_path)
            else:
                draw_triac_circuit(schem_path)
        else:
            draw_triac_circuit(schem_path)
    except Exception as e:
        print(f"Error executing schemdraw_code: {e}")
        draw_triac_circuit(schem_path)

    plot_path = os.path.join(run_dir, "figs", f"{slug}_plot.png")
    plt.legend()
    plt.tight_layout()
    plt.savefig(plot_path, dpi=300)
    plt.close()
"""

# Apply replacement safely
content = content.replace(old_run, new_run)

with open("main.py", "w") as f:
    f.write(content)
