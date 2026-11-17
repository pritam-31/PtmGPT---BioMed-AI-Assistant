from transformers import AutoProcessor, AutoModelForCausalLM
import torch

# Us folder ka path jahan tumne saari files paste ki hain
LOCAL_MODEL_PATH = "./model"

def load_model():
    print("MedGemma local files se load ho raha hai...")
    
    # Processor aur Tokenizer load karna
    processor = AutoProcessor.from_pretrained(LOCAL_MODEL_PATH)
    
    # Main model weights (.safetensors) load karna
    model = AutoModelForCausalLM.from_pretrained(
        LOCAL_MODEL_PATH,
        device_map="auto",          # GPU available ho toh automatically wahan shift karega
        torch_dtype=torch.float16   # Memory bachane ke liye half-precision
    )
    
    print("Model successfully loaded!")
    return processor, model

# Is function ko call karke model ko variable me store kar lo
# processor, model = load_model()