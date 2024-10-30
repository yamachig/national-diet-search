from .common import ChatModel


def get_model(key: str) -> ChatModel:
    match key:
        case "openai":
            from .openai import Model
            return Model()
        case "googleai":
            from .googleai import Model
            return Model()
        case "vertexai":
            from .vertexai import Model
            return Model()
        case _:
            raise ValueError(f"Unknown key: \"{key}\"")
