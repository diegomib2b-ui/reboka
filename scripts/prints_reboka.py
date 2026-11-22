"""Prints desktop e mobile da landing e do painel em modo demonstração. Uso: npm run build && python3 scripts/prints_reboka.py"""
import asyncio, subprocess, time
from playwright.async_api import async_playwright
TELAS = {"desktop": (1440, 900, 1), "mobile": (390, 844, 2)}
PAINEL = {"chamados": "#/chamados", "financeiro": "#/financeiro", "servicos": "#/servicos", "clientes": "#/clientes"}
async def main():
    srv = subprocess.Popen(["npx", "astro", "preview", "--port", "4399"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(4)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
            for tela, (w, h, s) in TELAS.items():
                pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=s)
                erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
                await pg.goto("http://localhost:4399/"); await pg.evaluate("document.fonts.ready"); await pg.wait_for_timeout(4500)
                await pg.screenshot(path=f"docs/prints/landing-{tela}.png", full_page=True)
                await pg.screenshot(path=f"docs/prints/landing-topo-{tela}.png")
                for nome, rota in PAINEL.items():
                    await pg.goto(f"http://localhost:4399/app/?demo=1{rota}"); await pg.wait_for_timeout(1800)
                    await pg.screenshot(path=f"docs/prints/{nome}-{tela}.png", full_page=(tela == "desktop"))
                await pg.goto("http://localhost:4399/app/?demo=1#/chamados"); await pg.wait_for_timeout(1500)
                await pg.click(".ch-novo-desk" if tela == "desktop" else ".ch-fab"); await pg.wait_for_timeout(400)
                await pg.fill("input[placeholder='Nome de quem chamou']", "Marina Prado")
                await pg.fill("input[placeholder='(41) 99999-0000']", "41991112222")
                await pg.fill("input[placeholder='Onix branco']", "Gol prata")
                await pg.select_option(".ch-form select", "Reboque de carro")
                await pg.fill("input[placeholder='Rua, número, bairro ou referência']", "Av. Winston Churchill, 2000, Capão Raso")
                await pg.fill("input[placeholder='Oficina, casa ou pátio']", "Auto Center Silva, Boqueirão")
                await pg.fill("input[placeholder='14']", "18"); await pg.click(".ch-adic button >> nth=0"); await pg.wait_for_timeout(300)
                await pg.screenshot(path=f"docs/prints/novo-chamado-{tela}.png")
                await pg.click(".ch-cot .btn-primario"); await pg.wait_for_timeout(600)
                await pg.click(".ch-agora footer .btn"); await pg.wait_for_timeout(400)   # o primeiro da fila pede cotação
                await pg.screenshot(path=f"docs/prints/cotar-{tela}.png")
                print(tela, erros)
                await pg.close()
            await b.close()
    finally:
        srv.terminate()
asyncio.run(main())
