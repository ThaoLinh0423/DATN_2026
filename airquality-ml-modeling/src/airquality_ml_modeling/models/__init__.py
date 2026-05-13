from airquality_ml_modeling.models.arima.model import ARIMA
from airquality_ml_modeling.models.lstm.model import LSTM
from airquality_ml_modeling.models.bilstm.model import BiLSTM
from airquality_ml_modeling.models.gru.model import GRU
from airquality_ml_modeling.models.informer.model import Informer

AVAILABLE_MODELS = {
    "arima":       ARIMA,
    "lstm":        LSTM,
    "bilstm":      BiLSTM,
    "gru":         GRU,
    "informer":    Informer,
}
