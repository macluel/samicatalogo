exports.handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "VERSION_12345",
      env: process.env.OMDB_API_KEY || null
    })
  };
};