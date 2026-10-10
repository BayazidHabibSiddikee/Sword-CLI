import os

with open("main.py", "r") as f:
    content = f.read()

# We need to save the data plot BEFORE running schemdraw_code!
old_code = """        except:
            pass
        
    try:
        schemdraw_code = circuit_json.get("schemdraw_code", "")"""

new_code = """        except:
            pass
            
    plot_path = os.path.join(run_dir, "figs", f"{slug}_plot.png")
    plt.legend()
    plt.tight_layout()
    plt.savefig(plot_path, dpi=300)
    plt.close()
        
    try:
        schemdraw_code = circuit_json.get("schemdraw_code", "")"""

content = content.replace(old_code, new_code)

old_code_2 = """    except Exception as e:
        print(f"Error executing schemdraw_code: {e}")
        draw_triac_circuit(schem_path)

    plot_path = os.path.join(run_dir, "figs", f"{slug}_plot.png")
    plt.legend()
    plt.tight_layout()
    plt.savefig(plot_path, dpi=300)
    plt.close()
    print("Scraping theory reference images (if enabled)...")"""

new_code_2 = """    except Exception as e:
        print(f"Error executing schemdraw_code: {e}")
        draw_triac_circuit(schem_path)

    print("Scraping theory reference images (if enabled)...")"""

content = content.replace(old_code_2, new_code_2)

with open("main.py", "w") as f:
    f.write(content)
