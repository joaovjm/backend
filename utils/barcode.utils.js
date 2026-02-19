import bwipjs from "bwip-js";

export async function barcodeGenerator(value) {
  try {
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: value.toString(),
      scale: 3,
      height: 8,
      includetext: true,
      textxalign: "center",
      textfont: 10,
    });

    return png;
  } catch (e) {
    console.error("Erro ao gerar código de barras:", e);
    throw e;
  }
}

