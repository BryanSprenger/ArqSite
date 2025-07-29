import streamlit as st
from streamlit_drawable_canvas import st_canvas
from shapely.geometry import Polygon
import json
import datetime

st.set_page_config(page_title="Desenho de Polígonos", layout="wide")

st.title("🖋️ Editor de Polígonos com Análise Geométrica")

st.sidebar.header("Configurações de Desenho")
stroke_width = st.sidebar.slider("Espessura da linha: ", 1, 5, 2)
stroke_color = st.sidebar.color_picker("Cor da linha:", "#000000")
bg_color = st.sidebar.color_picker("Cor do fundo:", "#ffffff")

st.sidebar.markdown("---")
exportar = st.sidebar.button("📤 Exportar Geometria em JSON")

# Tamanho da tela de desenho
canvas_result = st_canvas(
    fill_color="rgba(255, 165, 0, 0.3)",  # Cor de preenchimento
    stroke_width=stroke_width,
    stroke_color=stroke_color,
    background_color=bg_color,
    update_streamlit=True,
    height=500,
    width=700,
    drawing_mode="polygon",
    key="canvas",
)

if canvas_result.json_data is not None:
    objetos = canvas_result.json_data["objects"]
    
    if objetos:
        st.success("✅ Polígono desenhado!")
        
        # Pegando os pontos do último objeto
        poligono_desenhado = objetos[-1]
        path = poligono_desenhado["path"]

        # Extrai as coordenadas
        coords = [(p[1], p[2]) for p in path if len(p) == 3]

        if len(coords) >= 3:
            try:
                poligono = Polygon(coords)
                area = poligono.area
                perimetro = poligono.length

                st.subheader("📐 Métricas do Polígono")
                st.write(f"🟦 Área: `{area:.2f}` unidades²")
                st.write(f"📏 Perímetro: `{perimetro:.2f}` unidades")

                st.subheader("📄 Coordenadas:")
                st.json(coords)

                # Exportar como GeoJSON simples
                if exportar:
                    geojson = {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[list(coord) for coord in coords]]
                        },
                        "properties": {
                            "area": area,
                            "perimeter": perimetro,
                            "timestamp": datetime.datetime.now().isoformat()
                        }
                    }

                    json_str = json.dumps(geojson, indent=2)
                    st.download_button(
                        label="⬇️ Baixar GeoJSON",
                        data=json_str,
                        file_name="poligono_exportado.geojson",
                        mime="application/json"
                    )

            except Exception as e:
                st.error(f"Erro ao processar polígono: {e}")

        else:
            st.warning("Desenhe um polígono com ao menos 3 pontos.")
    else:
        st.info("Desenhe um polígono para iniciar.")
else:
    st.info("Carregando...")

