export default async function checkUser(req, res, next) {
  if (process.env.HF_TOKEN && process.env.HF_TOKEN !== "") {
    return next();
  }
  const { hf_token } = req.cookies;
  if (!hf_token) {
    return res.status(401).send({
      ok: false,
      message: "Unauthorized",
    });
  }
  next();
}
