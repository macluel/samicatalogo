const OMDB_BASE = 'https://www.omdbapi.com/';

exports.handler = async (event) => {
  try {
    const apiKey = process.env.OMDB_API_KEY;

    const params = event.queryStringParameters || {};
    const url = new URL(OMDB_BASE);

    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });

    url.searchParams.set('apikey', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        Response: 'False',
        Error: err.message
      })
    };
  }
};
