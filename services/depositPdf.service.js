import pkg from "pdfmake";
import extenso from "extenso";
import { barcodeGenerator } from "../utils/barcode.utils.js";
import fs from "fs";
import path from "path";

/**
 * Configuração de fontes obrigatória para pdfmake no Node.js
 * Esses arquivos existem dentro de node_modules/pdfmake/fonts
 */
const PdfPrinter = pkg;


const fonts = {
  Roboto: {
    normal: path.join(process.cwd(), "fonts/Roboto-Regular.ttf"),
    bold: path.join(process.cwd(), "fonts/Roboto-Bold.ttf"),
    italics: path.join(process.cwd(), "fonts/Roboto-Italic.ttf"),
    bolditalics: path.join(process.cwd(), "fonts/Roboto-BoldItalic.ttf"),
  },
};

const printer = new PdfPrinter(fonts);

export async function generateDepositPDF({ data, config, cpf_visible }) {
  if (!data || !config) {
    throw new Error("Dados ou configuração não fornecidos");
  }

  if (!data.receipt_donation_id)
    throw new Error("receipt_donation_id é obrigatório");

  if (!data.donor_name)
    throw new Error("donor_name é obrigatório");

  if (!data.donation_value)
    throw new Error("donation_value é obrigatório");

  if (!config.backOfReceipt)
    throw new Error("config.backOfReceipt é obrigatório");

  console.time("TOTAL_PDF");

  /**
   * ============================
   * GERAR CÓDIGO DE BARRAS
   * ============================
   */
  console.time("barcode");

  const barcodeBuffer = await barcodeGenerator(
    data.receipt_donation_id
  );

  console.timeEnd("barcode");

  const barcodeBase64 = `data:image/png;base64,${barcodeBuffer.toString(
    "base64"
  )}`;

  /**
   * ============================
   * CARREGAR IMAGEM DE FUNDO
   * ============================
   */
  const receiptImagePath = path.join(
    process.cwd(),
    "assets",
    "receipt.jpg"
  );

  if (!fs.existsSync(receiptImagePath)) {
    throw new Error("Imagem receipt.jpg não encontrada");
  }

  const receiptImageBuffer = fs.readFileSync(receiptImagePath);

  const receiptImageBase64 = `data:image/jpeg;base64,${receiptImageBuffer.toString(
    "base64"
  )}`;

  /**
   * ============================
   * LAYOUT DO PDF
   * ============================
   */
  console.time("layout");

  const header = {
    columns: [

      // espaço vazio à esquerda
      { width: "*", text: "" },

      // caixa recibo
      {
        width: 184,
        margin: [-40, 16, 10, 0],
        table: {
          body: [
            [

              {
                table: {
                  widths: [84, 104],
                  heights: [40, 40],
                  body: [

                    // LINHA RECIBO
                    [
                      {
                        fillColor: "#000",
                        stack: [
                          {
                            text: "RECIBO:",
                            bold: true,
                            fontSize: 13,
                            color: "#fff",
                            alignment: "center",
                            margin: [0, 10, 0, 0]
                          }
                        ],

                      },
                      {
                        stack: [
                          {
                            text: data.receipt_donation_id,
                            bold: true,
                            fontSize: 18,
                            alignment: "center",
                            margin: [0, 10, 0, 0]
                          }
                        ],
                      }
                    ],

                    // LINHA VALOR
                    [
                      {
                        stack: [
                          {
                            text: "VALOR:",
                            bold: true,
                            fontSize: 13,
                            alignment: "center",
                            margin: [0, 10, 0, 0],
                            color: "#fff",
                          }
                        ],
                        fillColor: "#000",

                      },
                      {
                        stack: [
                          {
                            text: data.donation_value?.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }),
                            bold: true,
                            fontSize: 18,
                            alignment: "center",
                            margin: [0, 10, 0, 0],
                          }
                        ],
                      }
                    ]
                  ]
                },

                layout: {
                  hLineWidth: () => 1,
                  vLineWidth: () => 1,
                  hLineColor: () => "#000",
                  vLineColor: () => "#000",

                  paddingLeft: () => 0,
                  paddingRight: () => 0,
                  paddingTop: () => 0,
                  paddingBottom: () => 0,
                },
              }

            ]
          ]

        },
      },



      // caixa barcode
      {
        width: 181,
        margin: [0, 13, 0, 0],
        table: {
          widths: ["*"],
          heights: [80],
          body: [
            [
              {
                image: barcodeBase64,
                fit: [160, 60],
                alignment: "center",
                valign: "middle"
              }
            ]
          ]
        },
        layout: {
          hLineWidth: () => 2,
          vLineWidth: () => 2,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 10,
          paddingBottom: () => 10,
        }
      }

    ]
  };

  const content = {
    margin: [96, 76, 36, 0],
    alignment: "start",
    stack: [

      {
        columns: [
          { text: "Recebemos de", fontSize: 16 },
          {
            text: data.donor_name.toUpperCase(),
            fontSize: 18,
            decoration: "underline",
            margin: [4, 0]
          },
          {
            text: cpf_visible ? `| CPF: ${data.cpf}` : "",
            fontSize: 18
          }
        ]
      },

      {
        margin: [0, 8],
        columns: [
          { text: "a importância de", fontSize: 16 },
          {
            text: extenso(Number(data.donation_value), {
              mode: "currency",
            }).toUpperCase(),
            decoration: "underline",
            fontSize: 16
          }
        ]
      },

      {
        text: `que será destinada à campanha ${data.donation_campain?.toUpperCase()}`,
        fontSize: 16,
        margin: [0, 8]
      },

      {
        text: `Rio de Janeiro, ${new Date(data.donation_day_received).toLocaleDateString("pt-BR", {
          timeZone: "UTC",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}`,
        fontSize: 16,
        margin: [0, 8]
      },

      {
        text: config.backOfReceipt,
        alignment: "center",
        fontSize: 20,
        margin: [0, 90, 0, 0]
      }

    ]
  };



  console.timeEnd("layout");

  /**
   * ============================
   * DEFINIÇÃO DO DOCUMENTO
   * ============================
   */
  const docDefinition = {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [0, 0, 0, 0],

    background: () => ({
      image: receiptImageBase64,
      width: 842,
      height: 595,
    }),

    content: [header, content],
    defaultStyle: {
      font: "Roboto",
    },
  };

  /**
   * ============================
   * GERAR BUFFER FINAL
   * ============================
   */
  console.time("pdfMake");

  return new Promise((resolve, reject) => {

    try {

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      const chunks = [];

      pdfDoc.on("data", (chunk) => {
        chunks.push(chunk);
      });

      pdfDoc.on("end", () => {

        const result = Buffer.concat(chunks);

        console.timeEnd("pdfMake");
        console.timeEnd("TOTAL_PDF");

        console.log("📦 PDF gerado:", result.length, "bytes");

        resolve(result);
      });

      pdfDoc.on("error", (err) => {
        console.error("Erro PDF:", err);
        reject(err);
      });

      pdfDoc.end();

    } catch (err) {
      reject(err);
    }

  });
}
