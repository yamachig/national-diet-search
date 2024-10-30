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

    - **OpenAI**:
    
        Make a `container-mount/.env` file with the following contents.

        ```ini
        MODEL=openai
        OPENAI_MODEL=...place the model name (e.g. gpt-4o-mini)...
        OPENAI_APIKEY=...place the api key here...
        ```

    - Optional: you can specify the unit price to estimate LLM API costs. (Note: this estimation is not the actual cost and may differ.)

        ```ini
        PRICE_USD_PER_TOKEN_IN=0.000 / 1_000_000
        PRICE_USD_PER_TOKEN_OUT=0.000 / 1_000_000
        ```

3. Run containers by `docker compose up`. Wait some minutes until the build and boot processes finish.

4. Navigate to http://localhost:8000/index.html

## How to add another generative AI model <a id="add-model"></a>

You can add a generative AI model by editing the `get_model()` function in [server/src/models/\_\_init\_\_.py](server/src/models/__init__.py) .

## References

https://kokkai.ndl.go.jp/api.html
