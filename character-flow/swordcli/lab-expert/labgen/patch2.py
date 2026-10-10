import os
with open("main.py", "r") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "netlist_content += f\"\"\"" in line and "Analysis" in lines[i+1]:
        start_idx = i
    if "except Exception as e:" in line and "Error plotting:" in lines[i+1]:
        end_idx = i + 3
        break

if start_idx != -1 and end_idx != -1:
    new_code = """
    # Extract components and find a resistor to vary
    comps = circuit_json.get("netlist_components", [])
    var_res_idx = -1
    for i, c in enumerate(comps):
        if c.strip().upper().startswith("R"):
            var_res_idx = i
            break
            
    r_vals = ["1k", "5k", "10k"] if var_res_idx != -1 else ["1k"]
    colors = ['b', 'r', 'g']
    
    import matplotlib.pyplot as plt
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
            import shutil
            shutil.copy(fb_txt_out, txt_out)
        except Exception:
            pass
    else:
        import shutil
        try:
            shutil.copy(txt_out.replace('.txt', '_0.txt'), txt_out)
        except:
            pass
        
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
    lines[start_idx:end_idx+1] = [new_code]
    with open("main.py", "w") as f:
        f.writelines(lines)
    print("Success")
else:
    print("Could not find bounds")
