import formidable from "formidable";
import { promises as fs } from "fs";

export async function parseRequest(req) {
  const contentType = req.headers["content-type"] || "";

  if (contentType.includes("multipart/form-data")) {
    const form = formidable({
      maxFileSize: 30 * 1024 * 1024,
      multiples: false,
    });

    return new Promise((resolve, reject) => {
      form.parse(req, async (err, fields, files) => {
        if (err) return reject(err);

        const getData = (field) =>
          Array.isArray(field) ? field[0] : field;

        const result = {
          emailTo: getData(fields.emailTo),
          subject: getData(fields.subject),
          text: getData(fields.text),
        };

        async function processFile(file, type) {
          const fileObj = Array.isArray(file) ? file[0] : file;
          const buffer = await fs.readFile(fileObj.filepath);

          result[type] = {
            filename: fileObj.originalFilename || fileObj.newFilename,
            content: buffer.toString("base64"),
            contentType: fileObj.mimetype,
          };
        }

        if (files.image) await processFile(files.image, "image");
        if (files.video) await processFile(files.video, "video");
        if (files.pdf) await processFile(files.pdf, "pdf");

        resolve(result);
      });
    });
  }

  if (contentType.includes("application/json")) {
    return req.body;
  }

  throw new Error("Content-Type não suportado");
}
