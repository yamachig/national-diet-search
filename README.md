National Diet Search with Questions
========================================================================

This app helps search for the record of the Japanese National Diet with questions written in natural language, utilizing generative AIs.

## Getting started

1. Prepare an account of generative AI API. This app supports Google Generative AI, Vertex AI, and OpenAI. Optionally, you can add a model following the instruction [here](#add-model). Be aware that calling the API may incur costs.

2. Configure the model settings as follows:

    - **Google Generative AI**:

        Make a `container-mount/.env` file with the following contents.

        ```ini
        MODEL=googleai
        GOOGLEAI_MODEL=...place the model name (e.g. gemini-1.5-flash)...
        GOOGLEAI_APIKEY=...place the api key here...
        ```

    - **Vertex AI**:

        Save the service account key JSON as `container-mount/apikey.json` and make a `container-mount/.env` file with the following contents.

        ```ini
        MODEL=vertexai
        VERTEXAI_PROJECT=...place the name of the project here...
        VERTEXAI_MODEL=...place the model name (e.g. gemini-1.5-flash)...
        VERTEXAI_REGION=...place the region name (e.g. asia-northeast1)...
        GOOGLE_APPLICATION_CREDENTIALS=../container-mount/apikey.json
        ```

        If you are deploying on Google Cloud, skip saving the service account key JSON and the `GOOGLE_APPLICATION_CREDENTIALS` line so that the default credentials will be used.

    - **OpenAI**:
    
        Make a `container-mount/.env` file with the following contents.

        ```ini
        MODEL=openai
        OPENAI_MODEL=...place the model name (e.g. gpt-4o-mini)...
        OPENAI_APIKEY=...place the api key here...
        ```

    - Optional: you can specify the unit price to estimate LLM API costs. (Note: this estimation is not the actual cost and may differ.)

        ```ini
        PRICE_USD_PER_UNIT_IN=0.000 / 1_000_000
        PRICE_USD_PER_UNIT_OUT=0.000 / 1_000_000
        ```

3. Run containers by `docker compose up`. Wait some minutes until the build and boot processes finish.

4. Navigate to http://localhost:8080/index.html

## How to add another generative AI model <a id="add-model"></a>

You can add a generative AI model by editing the `get_model()` function in [server/src/models/\_\_init\_\_.py](server/src/models/__init__.py) .

## How to enable authentication to the APIs

You can add authentication by Google Accounts with [Google Cloud Identity Platform](https://cloud.google.com/security/products/identity-platform) or [Firebase Authentication](https://firebase.google.com/docs/auth) to the APIs. Be aware that using identity services may incur costs.

After configuring one of the identity services and a Firebase credentials and a Firebase config object are ready, save the Firebase credentials as `container-mount/firebaseCredentials.json` and add the following configuration in `container-mount/.env` file.

```ini
FIREBASE_CREDENTIALS=../container-mount/firebaseCredentials.json
AUTH_SETTINGS='{"type":"firebase","firebaseConfig":{"apiKey":"....place the apiKey of config object...","authDomain":"....place the authDomain of config object..."}}'
```

If you are deploying to Google Cloud, skip saving the Firebase credentials and the `FIREBASE_CREDENTIALS` line so that the default credentials will be used.

## How to deploy to Google Cloud

You can deploy to Cloud Run on Google Cloud with `gcloud run deploy ...service-name... --source .` command along with setting the Cloud Run environment variables instead of `container-mount/.env` file. Be aware that using the cloud resource may incur costs.

## References

https://kokkai.ndl.go.jp/api.html
