import flask as f

app = f.Flask(__name__)

@app.route("/sensor_poll",methods=["GET"])
def sensors():
    return {"sensor_values": [
        {"id": "1",
         "temperature": 22.5,
         "ph": 7.2, 
         "turbidity": 0.8,
         "surface_light": 300,
         "sst": 25.0}]}


if __name__ == "__main__":
    app.run(debug=True, port=6767)